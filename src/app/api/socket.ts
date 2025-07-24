import { NextApiRequest, NextApiResponse } from "next";
import { Server } from "socket.io";
import { readData, writeData, Message } from "@/lib/jsonStore";

type WithSocketServerIO = NextApiResponse & {
  socket: {
    server: {
      io?: Server;
    };
  };
};

type SocketServerWithIO = {
  server: {
    io?: Server;
  };
};

const SocketHandler = (req: NextApiRequest, res: NextApiResponse) => {
  const resWithIO = res as WithSocketServerIO;
  if (resWithIO.socket?.server?.io) {
    return res.end();
  }

  // const socketServer = res.socket as unknown as SocketServerWithIO;
  const io = new Server((res.socket as any).server, {
    path: "/api/socket",
  });
  resWithIO.socket.server.io = io;

  io.on("connection", (socket) => {
    // JOIN ROOM
    socket.on("join-room", (roomId: string, username: string) => {
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
        data.rooms.push(room);
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
      io.to(roomId).emit("user-list", room.users);
      // Optionally, send room info to the joining user
      socket.emit("room-info", room);
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
        io.to(roomId).emit("receive-message", msg);
      }
    );

    // TYPING INDICATOR
    socket.on("typing", (roomId: string, username: string) => {
      socket.to(roomId).emit("user-typing", username);
    });

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
        io.to(roomId).emit("user-list", data.rooms[roomIdx].users);
      }
    });
  });

  res.end();
};

export default SocketHandler;
