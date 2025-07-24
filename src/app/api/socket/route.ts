import { Server } from "socket.io";
import { readData, writeData, Message } from "@/lib/jsonStore";

export const dynamic = "force-dynamic";

let io: Server | undefined;

type GlobalWithServer = typeof globalThis & { server?: any; io?: Server };

export async function GET() {
  // @ts-expect-error: Next.js custom global server instance for socket.io
  if (!(globalThis as GlobalWithServer).io) {
    (globalThis as GlobalWithServer).io = new Server(
      (globalThis as GlobalWithServer).server!,
      {
        path: "/api/socket",
      }
    );
    io = (globalThis as GlobalWithServer).io;
    console.log("Socket server initialized");

    io.on("connection", (socket) => {
      console.log("connected", socket.id);
      // JOIN ROOM
      socket.on("join-room", (roomId: string, username: string) => {
        console.log("join-rrom");
        const data = readData();
        let room = data.rooms.find((r) => r.id === roomId);
        if (!room) {
          // Create new room with this user as owner
          room = {
            id: roomId,
            owner: username,
            users: [username],
            messages: [],
          };
          console.log(data, "b4");
          data.rooms.push(room);
          console.log(data, "after");
        } else {
          // Add user if not already in room
          if (!room.users.includes(username)) {
            room.users.push(username);
          }
        }
        writeData(data);
        socket.join(roomId);
        // Notify others in the room
        socket.to(roomId).emit("user-joined", username);
        // Send updated user list to all
        io!.to(roomId).emit("user-list", room.users);
        // Optionally, send room info to the joining user
        socket.emit("room-info", room);
      });

      // GET USER ROOMS
      socket.on("get-user-rooms", (username: string) => {
        const data = readData();
        const userRooms = data.rooms.filter((room) =>
          room.users.includes(username)
        );
        socket.emit("user-rooms", userRooms);
      });

      // SEND MESSAGE
      socket.on(
        "send-message",
        (roomId: string, message: string, username: string) => {
          const data = readData();
          const room = data.rooms.find((r) => r.id === roomId);
          if (!room) return;
          const msg: Message = {
            message,
            username,
            timestamp: new Date().toISOString(),
          };
          room.messages.push(msg);
          writeData(data);
          io!.to(roomId).emit("receive-message", msg);
        }
      );

      // TYPING INDICATOR
      socket.on("typing", (roomId: string, username: string) => {
        socket.to(roomId).emit("user-typing", username);
      });

      // CHECK ROOM EXISTS
      socket.on("check-room-exists", (roomId: string) => {
        console.log("emit exitsts", roomId);
        const data = readData();
        const exists = data.rooms.some((room) => room.id === roomId);
        socket.emit("room-exists-result", { roomId, exists });
      });

      // REMOVE USER (owner only)
      socket.on(
        "remove-user",
        (roomId: string, owner: string, targetUser: string) => {
          const data = readData();
          const room = data.rooms.find((r) => r.id === roomId);
          if (!room) return;
          if (room.owner !== owner) return; // Only owner can remove
          if (!room.users.includes(targetUser)) return;
          // Remove user
          room.users = room.users.filter((u) => u !== targetUser);
          // If the removed user was the owner (shouldn't happen here), transfer ownership
          if (room.owner === targetUser) {
            if (room.users.length > 0) {
              room.owner = room.users[0];
            } else {
              // No users left, delete room
              const idx = data.rooms.findIndex((r) => r.id === roomId);
              if (idx !== -1) data.rooms.splice(idx, 1);
            }
          }
          writeData(data);
          // Notify the removed user (if connected)
          io!.to(roomId).emit("user-removed", targetUser);
          // Broadcast updated user list
          io!.to(roomId).emit("user-list", room.users);
        }
      );

      // LEAVE ROOM
      socket.on("leave-room", (roomId: string, username: string) => {
        const data = readData();
        const roomIdx = data.rooms.findIndex((r) => r.id === roomId);
        if (roomIdx === -1) return;
        const room = data.rooms[roomIdx];
        // Remove user from room
        room.users = room.users.filter((u) => u !== username);
        // Ownership transfer or room deletion
        if (room.owner === username) {
          if (room.users.length > 0) {
            room.owner = room.users[0]; // Transfer ownership
          } else {
            data.rooms.splice(roomIdx, 1); // Delete room if empty
          }
        }
        writeData(data);
        socket.leave(roomId);
        // Notify others in the room
        socket.to(roomId).emit("user-left", username);
        // Send updated user list
        if (data.rooms[roomIdx]) {
          io!.to(roomId).emit("user-list", data.rooms[roomIdx].users);
        }
      });
    });
  }
  return new Response("Socket server initialized");
}
