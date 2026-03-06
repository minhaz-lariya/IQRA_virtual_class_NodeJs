const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*" }
});

const roomTeachers = new Map();
const userConnections = new Map();
const roomParticipants = new Map();
const pendingUsers = new Map();

io.on('connection', (socket) => {

    console.log("====================================");
    console.log("New Socket Connected:", socket.id);
    console.log("====================================");

    // ===============================
    // JoinRoom
    // ===============================
    socket.on('JoinRoom', (roomId, userId, role) => {

        console.log("JoinRoom:", { roomId, userId, role });

        userConnections.set(userId, socket.id);
        socket.join(roomId);

        if (role === 'teacher') {

            console.log("Teacher registered for room:", roomId);
            roomTeachers.set(roomId, userId);

            if (!roomParticipants.has(roomId)) {
                roomParticipants.set(roomId, new Map());
            }

            roomParticipants.get(roomId).set(userId, true);

            const participants = Array.from(roomParticipants.get(roomId).keys());

            console.log("ParticipantsUpdated:", participants);
            socket.emit('ParticipantsUpdated', participants);
        }
    });

    // ===============================
    // RequestToJoin
    // ===============================
    socket.on('RequestToJoin', (roomId, studentUserId) => {

        console.log("RequestToJoin:", { roomId, studentUserId });

        userConnections.set(studentUserId, socket.id);

        if (!pendingUsers.has(roomId)) {
            pendingUsers.set(roomId, new Map());
        }

        pendingUsers.get(roomId).set(studentUserId, true);

        const teacherId = roomTeachers.get(roomId);

        if (!teacherId) {
            console.log("❌ No teacher found in room:", roomId);
            return;
        }

        const teacherConnectionId = userConnections.get(teacherId);

        if (teacherConnectionId) {
            console.log("Sending JoinRequestReceived to teacher:", teacherId);
            io.to(teacherConnectionId).emit('JoinRequestReceived', studentUserId);
        } else {
            console.log("❌ Teacher socket not found");
        }
    });

    // ===============================
    // AcceptUser
    // ===============================
    socket.on('AcceptUser', (roomId, studentUserId) => {

        console.log("AcceptUser:", { roomId, studentUserId });

        if (pendingUsers.has(roomId)) {
            pendingUsers.get(roomId).delete(studentUserId);
        }

        if (!roomParticipants.has(roomId)) {
            roomParticipants.set(roomId, new Map());
        }

        roomParticipants.get(roomId).set(studentUserId, true);

        const studentConnId = userConnections.get(studentUserId);

        if (!studentConnId) {
            console.log("❌ Student connection not found");
            return;
        }

        const studentSocket = io.sockets.sockets.get(studentConnId);

        if (studentSocket) {
            studentSocket.join(roomId);
            console.log("Student joined socket room:", roomId);
        }

        io.to(roomId).emit('UserAccepted', studentUserId);

        const participants = Array.from(roomParticipants.get(roomId).keys());
        io.to(roomId).emit('ParticipantsUpdated', participants);

        console.log("UserAccepted + ParticipantsUpdated broadcasted");
    });

    // ===============================
    // RejectUser
    // ===============================
    socket.on('RejectUser', (roomId, studentUserId) => {

        console.log("RejectUser:", { roomId, studentUserId });

        if (pendingUsers.has(roomId)) {
            pendingUsers.get(roomId).delete(studentUserId);
        }

        const studentConnId = userConnections.get(studentUserId);

        if (studentConnId) {
            io.to(studentConnId).emit('UserRejected', studentUserId);
            console.log("UserRejected sent to student");
        }
    });

    // ===============================
    // SendMessage
    // ===============================
    socket.on('SendMessage', (roomId, userId, message) => {

        console.log("SendMessage:", {
            roomId,
            from: userId,
            message
        });

        io.to(roomId).emit('ReceiveMessage', userId, message);
    });

    // ===============================
    // SendSignal (WebRTC)
    // ===============================
    socket.on('SendSignal', (roomId, targetUserId, senderUserId, signal) => {

        console.log("====================================");
        console.log("SendSignal:");
        console.log("Room:", roomId);
        console.log("From:", senderUserId);
        console.log("To:", targetUserId);
        console.log("Signal Type:", signal?.type || "ICE Candidate");
        console.log("====================================");

        const connectionId = userConnections.get(targetUserId);

        if (connectionId) {
            io.to(connectionId).emit('ReceiveSignal', senderUserId, signal);
        } else {
            console.log("❌ Target user not connected:", targetUserId);
        }
    });

    // ===============================
    // Disconnect
    // ===============================
    socket.on('disconnect', () => {

        console.log("Socket disconnected:", socket.id);

        let disconnectedUser = null;

        for (let [userId, connId] of userConnections.entries()) {
            if (connId === socket.id) {
                disconnectedUser = userId;
                userConnections.delete(userId);
                break;
            }
        }

        if (disconnectedUser) {

            console.log("Disconnected user:", disconnectedUser);

            roomParticipants.forEach((participants, roomId) => {

                if (participants.has(disconnectedUser)) {

                    participants.delete(disconnectedUser);

                    io.to(roomId).emit('UserDisconnected', disconnectedUser);
                    io.to(roomId).emit(
                        'ParticipantsUpdated',
                        Array.from(participants.keys())
                    );

                    console.log("Participants updated after disconnect");
                }
            });
        }
    });
});

const PORT = 7860;

server.listen(PORT, "0.0.0.0", () => {
    console.log("====================================");
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log("====================================");
});