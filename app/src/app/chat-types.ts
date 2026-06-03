export type ChatScopeType =
  | "organization"
  | "project"
  | "virtual_row"
  | "virtual_table";

export type ChatAttachmentRef = {
  label: string;
  url: string;
};

export type ChatMessageRow = {
  id: string;
  room_id: string;
  author_id: string;
  body: string;
  attachment_refs: ChatAttachmentRef[];
  created_at: string;
};

export type ChatMentionOption = {
  id: string;
  label: string;
  kind: "user" | "project" | "row" | "table";
  /** Teks tambahan untuk filter autocomplete (mis. email, key project). */
  searchText?: string;
};
