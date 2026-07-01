/**
 * PR-H — tulis cache chat ke IndexedDB dari service worker (push handler).
 * Kontrak key/namespace harus selaras dengan client-indexed-db-storage + chat-room-cache.
 */
const PUSH_CACHE_IDB_NAME = "spatial-pm-cache-v1";
const PUSH_CACHE_IDB_STORE = "records";
const PUSH_CACHE_CHAT_ROOM_NS = "chat-room-v1";
const PUSH_CACHE_INBOX_NS = "push-inbox-meta-v1";
const PUSH_CACHE_MAX_MESSAGES = 120;

function pushCacheRecordKey(namespace, entryKey) {
  return namespace + "::" + entryKey;
}

function pushCacheOpenDb() {
  return new Promise(function (resolve, reject) {
    var request = indexedDB.open(PUSH_CACHE_IDB_NAME, 1);
    request.onupgradeneeded = function () {
      var db = request.result;
      if (!db.objectStoreNames.contains(PUSH_CACHE_IDB_STORE)) {
        db.createObjectStore(PUSH_CACHE_IDB_STORE);
      }
    };
    request.onsuccess = function () {
      resolve(request.result);
    };
    request.onerror = function () {
      reject(request.error || new Error("idb open failed"));
    };
  });
}

function pushCacheIdbGet(namespace, entryKey) {
  return pushCacheOpenDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(PUSH_CACHE_IDB_STORE, "readonly");
      var store = tx.objectStore(PUSH_CACHE_IDB_STORE);
      var req = store.get(pushCacheRecordKey(namespace, entryKey));
      req.onsuccess = function () {
        var envelope = req.result;
        resolve(
          envelope && envelope.payload != null ? envelope.payload : null
        );
      };
      req.onerror = function () {
        reject(req.error || new Error("idb get failed"));
      };
    });
  });
}

function pushCacheIdbPut(namespace, entryKey, payload) {
  var envelope = {
    payload: payload,
    updatedAt: payload.updatedAt || Date.now(),
  };
  return pushCacheOpenDb().then(function (db) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction(PUSH_CACHE_IDB_STORE, "readwrite");
      var store = tx.objectStore(PUSH_CACHE_IDB_STORE);
      var req = store.put(envelope, pushCacheRecordKey(namespace, entryKey));
      req.onsuccess = function () {
        resolve();
      };
      req.onerror = function () {
        reject(req.error || new Error("idb put failed"));
      };
    });
  });
}

function pushCacheAppendMessage(existing, msg) {
  var byId = {};
  var all = (existing || []).concat([msg]);
  for (var i = 0; i < all.length; i++) {
    byId[all[i].id] = all[i];
  }
  var merged = Object.keys(byId).map(function (k) {
    return byId[k];
  });
  merged.sort(function (a, b) {
    return String(a.created_at).localeCompare(String(b.created_at));
  });
  if (merged.length > PUSH_CACHE_MAX_MESSAGES) {
    return merged.slice(merged.length - PUSH_CACHE_MAX_MESSAGES);
  }
  return merged;
}

function pushCachePatchInboxMeta(orgId, inboxRoomKey, meta) {
  var entryKey = "org:" + orgId;
  return pushCacheIdbGet(PUSH_CACHE_INBOX_NS, entryKey).then(function (existing) {
    var entry = existing || { patches: {}, updatedAt: 0 };
    entry.patches[inboxRoomKey] = meta;
    entry.updatedAt = Date.now();
    return pushCacheIdbPut(PUSH_CACHE_INBOX_NS, entryKey, entry);
  });
}

function pushCacheApplyChatMessage(cache) {
  if (!cache || cache.kind !== "chat_message") {
    return Promise.resolve({ applied: false });
  }
  var roomCacheKey = cache.roomCacheKey;
  var message = cache.message;
  if (!roomCacheKey || !message || !message.id) {
    return Promise.resolve({ applied: false });
  }

  return pushCacheIdbGet(PUSH_CACHE_CHAT_ROOM_NS, roomCacheKey)
    .then(function (existing) {
      var snapshot = existing || {
        roomId: cache.roomId || null,
        messages: [],
        hasOlder: false,
        lastReadAt: null,
        updatedAt: Date.now(),
      };

      var hasMsg = false;
      for (var i = 0; i < snapshot.messages.length; i++) {
        if (snapshot.messages[i].id === message.id) {
          hasMsg = true;
          break;
        }
      }

      if (!hasMsg) {
        snapshot.messages = pushCacheAppendMessage(snapshot.messages, message);
        snapshot.roomId = cache.roomId || snapshot.roomId;
        snapshot.updatedAt = Date.now();
      }

      return pushCacheIdbPut(
        PUSH_CACHE_CHAT_ROOM_NS,
        roomCacheKey,
        snapshot
      ).then(function () {
        var inboxWork = Promise.resolve();
        if (cache.organizationId && cache.inboxRoomKey) {
          inboxWork = pushCachePatchInboxMeta(
            cache.organizationId,
            cache.inboxRoomKey,
            {
              lastActivityAt: cache.lastActivityAt || message.created_at,
              lastMessagePreview:
                cache.lastMessagePreview ||
                String(message.body || "").slice(0, 140) ||
                null,
            }
          );
        }
        return inboxWork.then(function () {
          return {
            applied: true,
            kind: "chat_message",
            roomCacheKey: roomCacheKey,
            organizationId: cache.organizationId || null,
            inboxRoomKey: cache.inboxRoomKey || null,
          };
        });
      });
    })
    .catch(function () {
      return { applied: false };
    });
}

/** Dipanggil dari sw.js push handler. */
function applyPushCacheHints(pushPayload) {
  var cache = pushPayload && pushPayload.cache;
  if (!cache) {
    return Promise.resolve({ applied: false });
  }
  if (cache.kind === "chat_message") {
    return pushCacheApplyChatMessage(cache);
  }
  return Promise.resolve({ applied: false });
}
