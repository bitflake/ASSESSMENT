import fs from "fs";
import path from "path";

const DATA_PATH = path.join(process.cwd(), "src/data/chat.json");

export type Message = {
  message: string;
  username: string;
  timestamp: string;
};

export type Room = {
  id: string;
  owner: string;
  users: string[];
  messages: Message[];
};

export type ChatData = {
  rooms: Room[];
};

export function readData(): ChatData {
  if (!fs.existsSync(DATA_PATH)) {
    fs.writeFileSync(DATA_PATH, JSON.stringify({ rooms: [] }, null, 2));
  }
  const data = fs.readFileSync(DATA_PATH, "utf-8");
  return JSON.parse(data);
}

export function writeData(data: ChatData) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));
}
