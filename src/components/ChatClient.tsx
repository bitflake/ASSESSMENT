"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter, useParams } from "next/navigation";
import { socket } from "@/lib/socket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useChatStore } from "@/store/chatStore";
import { useToast } from "@/hooks/use-toast";
import { LogOut, Send, Copy, Plus, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
// Room type for sidebar
type Room = {
  id: string;
  owner: string;
  users: string[];
  messages: { message: string; username: string; timestamp: string }[];
};

export default function ChatClient() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const roomId = params.roomId as string;

  const {
    username,
    messagesByRoom,
    unreadByRoom,
    addMessage,
    clearMessages,
    setMessages,
    resetUnread,
    setUsername,
  } = useChatStore();
  const [message, setMessage] = useState("");
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [userListOpen, setUserListOpen] = useState(false);
  const [roomUsers, setRoomUsers] = useState<string[]>([]);
  // Track which rooms have been initialized to avoid repeated setMessages
  const initializedRoomsRef = useRef<Set<string>>(new Set());
  const [pendingRemoveUser, setPendingRemoveUser] = useState<string | null>(
    null
  );

  useEffect(() => {
    // Restore username from localStorage if missing
    if (!username) {
      const stored = localStorage.getItem("username");
      if (stored) {
        setUsername(stored);
      }
    }
  }, []);

  useEffect(() => {
    if (!roomId || !username) {
      router.push("/");
      return;
    }

    socket.connect();
    socket.emit("join-room", roomId, username);

    // Fetch user's rooms
    socket.emit("get-user-rooms", username);
    socket.on("user-rooms", (userRooms) => {
      setRooms(userRooms);
      // Set messages for all rooms if not already set
      userRooms.forEach((room: Room) => {
        if (!initializedRoomsRef.current.has(room.id)) {
          setMessages(
            room.id,
            room.messages.map((msg) => ({
              ...msg,
              timestamp: new Date(msg.timestamp),
            }))
          );
          initializedRoomsRef.current.add(room.id);
        }
      });
    });

    // Listen for user list updates
    socket.on("user-list", (users: string[]) => {
      setRoomUsers(users);
    });

    // Listen for user-removed (if this user is removed, leave the room)
    socket.on("user-removed", (removedUser: string) => {
      if (removedUser === username) {
        toast({
          title: "You were removed from the room",
          variant: "destructive",
        });
        router.push("/");
      }
    });

    socket.on("user-typing", (typingUsername) => {
      if (typingUsername !== username) {
        setTypingUser(typingUsername);
        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = setTimeout(() => setTypingUser(null), 2000);
      }
    });

    // Listen for user-joined
    socket.on("user-joined", (joinedUsername) => {
      if (joinedUsername !== username) {
        toast({
          title: `${joinedUsername} joined the room`,
        });
      }
    });

    // Reset unread count when entering this room
    resetUnread(roomId);

    // Fetch initial user list for this room
    socket.emit("get-user-rooms", username); // This will update rooms, and user-list will be sent by backend
    // Optionally, you could add a dedicated event to fetch user-list for a room

    return () => {
      socket.emit("leave-room", roomId, username);
      socket.disconnect();
      clearMessages(roomId);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      socket.off("user-rooms");
      socket.off("user-joined");
      socket.off("user-list");
      socket.off("user-removed");
    };
  }, [
    roomId,
    username,
    addMessage,
    clearMessages,
    setMessages,
    resetUnread,
    toast,
    router,
    setUsername,
  ]);

  // Find current room and owner
  const currentRoom = rooms.find((r) => r.id === roomId);
  const isOwner = currentRoom && currentRoom.owner === username;

  const sendMessage = () => {
    if (!message.trim()) return;
    addMessage(roomId, { message, username, timestamp: new Date() }, true);
    socket.emit("send-message", roomId, message, username);
    setMessage("");
  };

  const leaveRoom = () => {
    router.push("/");
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    toast({
      title: "Room ID copied!",
      description: "Share this with others to join the chat.",
    });
  };

  const messages = messagesByRoom[roomId] || [];

  const confirmRemoveUser = () => {
    if (!currentRoom || !pendingRemoveUser) return;
    socket.emit("remove-user", roomId, username, pendingRemoveUser);
    setPendingRemoveUser(null);
  };

  return (
    <div className="h-[calc(100vh)]">
      <div className="grid grid-cols-12 h-full">
        {/* Sidebar */}
        <Card className="col-span-3 flex flex-col h-full rounded-none">
          <div className="p-4 border-b">
            <h2 className="font-semibold text-lg mb-4">Your Chats</h2>
            <Button className="w-full" variant="outline">
              <Plus className="h-4 w-4 mr-2" />
              Join New Room
            </Button>
            <Button
              className="w-full mt-2"
              variant="secondary"
              onClick={() => setUserListOpen(true)}
            >
              View Users
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2">
              {rooms.length === 0 ? (
                <div className="text-center text-muted-foreground text-sm py-4">
                  You are not in any rooms.
                </div>
              ) : (
                rooms.map((room) => (
                  <div key={room.id}>
                    <Button
                      variant={room.id === roomId ? "secondary" : "ghost"}
                      className="w-full justify-start mb-1 relative"
                      onClick={() => router.push(`/chat/${room.id}`)}
                    >
                      <MessageSquare className="h-4 w-4 mr-2" />
                      <span className="flex-1 text-left">
                        {room.id === roomId ? "Current Room" : room.id}
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Owner: {room.owner}
                        </div>
                      </span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {room.users.length} user
                        {room.users.length !== 1 ? "s" : ""}
                      </span>
                      {unreadByRoom[room.id] > 0 && room.id !== roomId && (
                        <Badge
                          className="ml-2 absolute right-2 top-2"
                          variant="secondary"
                        >
                          {unreadByRoom[room.id]}
                        </Badge>
                      )}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
          <Separator />
          <div className="p-4">
            <div className="flex items-center space-x-2">
              <div className="flex-1">
                <p className="text-sm font-medium">Logged in as:</p>
                <p className="text-sm text-muted-foreground">{username}</p>
              </div>
              <Button variant="ghost" size="sm" onClick={leaveRoom}>
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>

        {/* Main Chat Area */}
        <Card className="col-span-9 flex flex-col h-full rounded-none">
          {/* Header */}
          <div className="p-4 border-b flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div>
                <h2 className="text-2xl font-bold">Chat Room</h2>
                <div className="flex items-center space-x-2">
                  <code className="text-sm text-muted-foreground">
                    {roomId}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={copyRoomId}
                    className="h-8 w-8"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setUserListOpen(true)}
                  >
                    Users
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {messages.map((msg: (typeof messages)[0], idx: number) =>
                msg.type === "system" ? (
                  <div key={idx} className="flex justify-center">
                    <div className="bg-gray-200 text-gray-700 rounded px-4 py-2 text-sm font-medium text-center">
                      {msg.message}
                    </div>
                  </div>
                ) : (
                  <div
                    key={idx}
                    className={`flex flex-col ${
                      msg.username === username ? "items-end" : "items-start"
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-lg p-3 ${
                        msg.username === username
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <p className="font-semibold text-sm">
                          {msg.username === username ? "You" : msg.username}
                        </p>
                        <span className="text-xs opacity-70">
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <p className="mt-1">{msg.message}</p>
                    </div>
                  </div>
                )
              )}
            </div>
          </ScrollArea>

          {/* Input Area */}
          <div className="p-4 border-t">
            {typingUser && (
              <div className="text-sm text-muted-foreground mb-2">
                {typingUser} is typing...
              </div>
            )}
            <div className="flex space-x-2">
              <Input
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  socket.emit("typing", roomId, username);
                }}
                placeholder="Type your message..."
                className="flex-1 h-14"
              />
              <Button onClick={sendMessage} className="h-14">
                <Send className="h-4 w-4 mr-2" />
                Send
              </Button>
            </div>
          </div>
        </Card>
        {/* User List Modal */}
        <Dialog open={userListOpen} onOpenChange={setUserListOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Room Users</DialogTitle>
            </DialogHeader>
            <ul className="space-y-2">
              {roomUsers.map((user) => (
                <li key={user} className="flex items-center justify-between">
                  <span>
                    {user}
                    {currentRoom && user === currentRoom.owner && (
                      <Badge className="ml-2" variant="secondary">
                        Owner
                      </Badge>
                    )}
                    {user === username && <Badge className="ml-2">You</Badge>}
                  </span>
                  {isOwner && user !== username && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setPendingRemoveUser(user)}
                        >
                          Remove
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>
                            Remove user &quot;{pendingRemoveUser}&quot;?
                          </AlertDialogTitle>
                        </AlertDialogHeader>
                        <p>
                          Are you sure you want to remove this user from the
                          room? This action cannot be undone.
                        </p>
                        <AlertDialogFooter>
                          <AlertDialogCancel
                            onClick={() => setPendingRemoveUser(null)}
                          >
                            Cancel
                          </AlertDialogCancel>
                          <AlertDialogAction onClick={confirmRemoveUser}>
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  )}
                </li>
              ))}
            </ul>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
