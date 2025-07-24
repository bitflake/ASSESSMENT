"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { MessageSquarePlus, LogIn } from "lucide-react";
import { useChatStore } from "@/store/chatStore";
import { socket } from "@/lib/socket";
import { useToast } from "@/hooks/use-toast";

export default function HomeClient() {
  const router = useRouter();
  const setUsername = useChatStore((state) => state.setUsername);
  const [username, setUsernameLocal] = useState("");
  const [roomId, setRoomId] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [roomIdError, setRoomIdError] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    // Restore username from localStorage if missing
    const stored = localStorage.getItem("username");
    if (!username && stored) {
      setUsernameLocal(stored);
      setUsername(stored);
    }
  }, []);

  const createRoom = () => {
    let hasError = false;
    if (!username.trim()) {
      setUsernameError("Username is required");
      hasError = true;
    } else {
      setUsernameError("");
    }
    // No need to check roomId for createRoom
    setRoomIdError("");
    if (hasError) return;
    const newRoomId = Math.random().toString(36).substring(7);
    setUsername(username);
    localStorage.setItem("username", username);
    // Save to backend (JSON) by joining the room
    socket.connect();
    socket.emit("join-room", newRoomId, username);
    // Fetch updated rooms after creation
    socket.emit("get-user-rooms", username);
    console.log("toFinal", newRoomId);
    router.push(`/chat/${newRoomId}`);
  };

  const joinRoom = async () => {
    let hasError = false;
    if (!username.trim()) {
      setUsernameError("Username is required");
      hasError = true;
    } else {
      setUsernameError("");
    }
    if (!roomId.trim()) {
      setRoomIdError("Room ID is required");
      hasError = true;
    } else {
      setRoomIdError("");
    }
    if (hasError) return;
    // Check if room exists before joining
    await socket.connect();

    const handleRoomExists = (result: { roomId: string; exists: boolean }) => {
      console.log(result, "chexk--joining");
      if (result.roomId !== roomId) return;
      if (result.exists) {
        setUsername(username);
        localStorage.setItem("username", username);
        router.push(`/chat/${roomId}`);
      } else {
        toast({
          title: "Room does not exist",
          description: `Room ID '${roomId}' was not found. Please check and try again.`,
          variant: "destructive",
        });
      }
      socket.off("room-exists-result", handleRoomExists);
    };
    socket.on("room-exists-result", handleRoomExists);
    await socket.emit("check-room-exists", roomId);
    localStorage.setItem("username", username);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-8rem)]">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl font-bold">
            Welcome to JoyRoom
          </CardTitle>
          <CardDescription>
            Create a new room or join an existing one to start chatting
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">
              Username <span className="text-red-500">*</span>
            </Label>
            <Input
              id="username"
              placeholder="Enter your username"
              value={username}
              onChange={(e) => {
                setUsernameLocal(e.target.value);
                if (e.target.value.trim()) setUsernameError("");
              }}
              className="w-full"
              required
            />
            {usernameError && (
              <p className="text-sm text-red-500 mt-1">{usernameError}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="roomId">Room ID</Label>
            <Input
              id="roomId"
              placeholder="Enter room ID to join"
              value={roomId}
              onChange={(e) => {
                setRoomId(e.target.value);
                if (e.target.value.trim()) setRoomIdError("");
              }}
              className="w-full"
            />
            {roomIdError && (
              <p className="text-sm text-red-500 mt-1">{roomIdError}</p>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex flex-col space-y-2">
          <Button
            onClick={createRoom}
            className="w-full"
            variant="default"
            size="lg"
          >
            <MessageSquarePlus className="mr-2 h-5 w-5" />
            Create New Room
          </Button>
          <Button
            onClick={joinRoom}
            className="w-full"
            variant="secondary"
            size="lg"
            disabled={!roomId.trim()}
            title={!roomId.trim() ? "Please enter a room ID to join" : ""}
          >
            <LogIn className="mr-2 h-5 w-5" />
            Join Existing Room
          </Button>
        </CardFooter>
      </Card>

      <div className="mt-8 text-center text-sm text-muted-foreground">
        <p>Property of Javat 365</p>
      </div>
    </div>
  );
}
