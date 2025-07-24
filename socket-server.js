import { Server } from "socket.io";
import { readData, writeData } from "./src/lib/jsonStore.js";

// Initialize data using jsonStore
let rooms = [];

// Initialize data from jsonStore
try {
  const data = readData();
  rooms = data.rooms || [];
  console.log(`Loaded ${rooms.length} rooms from jsonStore`);
} catch (error) {
  console.log("No existing data, starting with empty rooms:", error.message);
  rooms = [];
}

// Save data using jsonStore
function saveData() {
  try {
    writeData({ rooms });
  } catch (error) {
    console.error("Error saving data:", error);
  }
}

const io = new Server(3001, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

console.log("Socket.IO server starting on port 3001...");

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  // JOIN ROOM
  socket.on("join-room", (roomId, username) => {
    console.log("User joining room:", roomId, username);
    let room = rooms.find((r) => r.id === roomId);
    if (!room) {
      // Create new room with this user as owner
      room = {
        id: roomId,
        owner: username,
        users: [username],
        messages: [],
      };
      console.log("Creating new room:", room);
      rooms.push(room);
    } else {
      // Add user if not already in room
      if (!room.users.includes(username)) {
        room.users.push(username);
      }
    }
    saveData();
    socket.join(roomId);
    // Notify others in the room
    socket.to(roomId).emit("user-joined", username);
    // Send updated user list to all
    io.to(roomId).emit("user-list", room.users);
    // Optionally, send room info to the joining user
    socket.emit("room-info", room);
  });

  // GET USER ROOMS
  socket.on("get-user-rooms", (username) => {
    const userRooms = rooms.filter((room) => room.users.includes(username));
    socket.emit("user-rooms", userRooms);
  });

  // SEND MESSAGE
  socket.on("send-message", (roomId, message, username) => {
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return;
    const msg = {
      message,
      username,
      timestamp: new Date().toISOString(),
    };
    room.messages.push(msg);
    saveData();
    io.to(roomId).emit("receive-message", msg);
  });

  // TYPING INDICATOR
  socket.on("typing", (roomId, username) => {
    socket.to(roomId).emit("user-typing", username);
  });

  // CHECK ROOM EXISTS
  socket.on("check-room-exists", (roomId) => {
    console.log("Checking if room exists:", roomId);
    const exists = rooms.some((room) => room.id === roomId);
    socket.emit("room-exists-result", { roomId, exists });
  });

  // REMOVE USER (owner only)
  socket.on("remove-user", (roomId, owner, targetUser) => {
    const room = rooms.find((r) => r.id === roomId);
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
        const idx = rooms.findIndex((r) => r.id === roomId);
        if (idx !== -1) rooms.splice(idx, 1);
      }
    }
    saveData();
    // Notify the removed user (if connected)
    io.to(roomId).emit("user-removed", targetUser);
    // Broadcast updated user list
    io.to(roomId).emit("user-list", room.users);
  });

  // LEAVE ROOM
  socket.on("leave-room", (roomId, username) => {
    const roomIdx = rooms.findIndex((r) => r.id === roomId);
    if (roomIdx === -1) return;
    const room = rooms[roomIdx];

    // Check if user is in the room
    if (!room.users.includes(username)) return;

    // Remove user from room
    room.users = room.users.filter((u) => u !== username);

    // Handle ownership transfer or room deletion
    if (room.owner === username) {
      if (room.users.length > 0) {
        // Transfer ownership to the next user in the list
        room.owner = room.users[0];
        console.log(
          `Ownership transferred from ${username} to ${room.owner} in room ${roomId}`
        );

        // Notify all users about ownership change
        io.to(roomId).emit("ownership-changed", {
          newOwner: room.owner,
          previousOwner: username,
          roomId: roomId,
        });
      } else {
        // No users left, delete the room
        rooms.splice(roomIdx, 1);
        console.log(`Room ${roomId} deleted - no users remaining`);

        // Notify all users that room was deleted
        io.to(roomId).emit("room-deleted", {
          roomId: roomId,
          reason: "No users remaining",
        });
      }
    }

    saveData();
    socket.leave(roomId);

    // Notify others in the room about user leaving
    socket.to(roomId).emit("user-left", {
      username: username,
      wasOwner: room.owner === username,
      roomId: roomId,
    });

    // Send updated user list if room still exists
    if (
      roomIdx < rooms.length &&
      rooms[roomIdx] &&
      rooms[roomIdx].id === roomId
    ) {
      io.to(roomId).emit("user-list", rooms[roomIdx].users);
      io.to(roomId).emit("room-info", rooms[roomIdx]);
    }
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);

    // Find all rooms this user was in and handle their departure
    const userRooms = rooms.filter((room) =>
      room.users.some((user) => user === socket.username)
    );

    userRooms.forEach((room) => {
      const username = socket.username;
      if (!username) return;

      const roomIdx = rooms.findIndex((r) => r.id === room.id);
      if (roomIdx === -1) return;

      const roomData = rooms[roomIdx];

      // Check if user is in the room
      if (!roomData.users.includes(username)) return;

      // Remove user from room
      roomData.users = roomData.users.filter((u) => u !== username);

      // Handle ownership transfer or room deletion
      if (roomData.owner === username) {
        if (roomData.users.length > 0) {
          // Transfer ownership to the next user in the list
          roomData.owner = roomData.users[0];
          console.log(
            `Ownership transferred from ${username} to ${roomData.owner} in room ${room.id} (disconnect)`
          );

          // Notify all users about ownership change
          io.to(room.id).emit("ownership-changed", {
            newOwner: roomData.owner,
            previousOwner: username,
            roomId: room.id,
          });
        } else {
          // No users left, delete the room
          rooms.splice(roomIdx, 1);
          console.log(
            `Room ${room.id} deleted - no users remaining (disconnect)`
          );

          // Notify all users that room was deleted
          io.to(room.id).emit("room-deleted", {
            roomId: room.id,
            reason: "No users remaining",
          });
        }
      }

      // Notify others in the room about user leaving
      io.to(room.id).emit("user-left", {
        username: username,
        wasOwner: roomData.owner === username,
        roomId: room.id,
        reason: "disconnected",
      });

      // Send updated user list if room still exists
      if (
        roomIdx < rooms.length &&
        rooms[roomIdx] &&
        rooms[roomIdx].id === room.id
      ) {
        io.to(room.id).emit("user-list", rooms[roomIdx].users);
        io.to(room.id).emit("room-info", rooms[roomIdx]);
      }
    });

    saveData();
  });
});

console.log("Socket.IO server is running on port 3001");
