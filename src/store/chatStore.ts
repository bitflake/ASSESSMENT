import { create } from "zustand";

export interface Message {
  message: string;
  username?: string;
  timestamp: Date;
  type?: "system";
}

export interface ChatStore {
  username: string;
  messagesByRoom: { [roomId: string]: Message[] };
  unreadByRoom: { [roomId: string]: number };
  setUsername: (username: string) => void;
  addMessage: (roomId: string, message: Message, isActiveRoom: boolean) => void;
  clearMessages: (roomId: string) => void;
  setMessages: (roomId: string, messages: Message[]) => void;
  resetUnread: (roomId: string) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  username: "",
  messagesByRoom: {},
  unreadByRoom: {},
  setUsername: (username) => set({ username }),
  addMessage: (roomId, message, isActiveRoom) =>
    set((state) => {
      const prevMessages = state.messagesByRoom[roomId] || [];
      const unread = state.unreadByRoom[roomId] || 0;
      return {
        messagesByRoom: {
          ...state.messagesByRoom,
          [roomId]: [...prevMessages, message],
        },
        unreadByRoom: {
          ...state.unreadByRoom,
          [roomId]: isActiveRoom ? 0 : unread + 1,
        },
      };
    }),
  clearMessages: (roomId) =>
    set((state) => ({
      messagesByRoom: { ...state.messagesByRoom, [roomId]: [] },
      unreadByRoom: { ...state.unreadByRoom, [roomId]: 0 },
    })),
  setMessages: (roomId, messages) =>
    set((state) => ({
      messagesByRoom: { ...state.messagesByRoom, [roomId]: messages },
      unreadByRoom: { ...state.unreadByRoom, [roomId]: 0 },
    })),
  resetUnread: (roomId) =>
    set((state) => ({
      unreadByRoom: { ...state.unreadByRoom, [roomId]: 0 },
    })),
}));
