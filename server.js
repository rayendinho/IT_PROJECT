const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const sessionContext = {};
const chatHistory = {};

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

const responsesPath = path.join(__dirname, 'botResponses.json');
let responses = [];

// Read bot responses from JSON file
try {
    const data = fs.readFileSync(responsesPath, 'utf-8');
    responses = JSON.parse(data);
} catch (err) {
    console.error('Error reading botResponses.json:', err);
    process.exit(1);
}

const maxFailures = 3;

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Serve chat history
app.get('/chat-history', (req, res) => {
    // Example: Sending mock chat history for demonstration
    const history = [
        { speaker: 'bot', message: 'Hi there! How can I help you?' }
    ];
    res.json(history);
});

// Socket.IO connection handler
io.on('connection', (socket) => {
    const userId = socket.id;
    console.log(`User connected: ${userId}`);

    // Initialize chat history for new users
    if (!chatHistory[userId]) {
        chatHistory[userId] = [];
    }

    // Initialize session context for new users
    if (!sessionContext[userId]) {
        sessionContext[userId] = {
            consecutiveFailures: 0
        };
    }


    // Send chat history to the user upon connection
    socket.emit('chat history', chatHistory[userId]);

    // Event listener for incoming messages from the client
    socket.on('chat message', (msg) => {
        console.log(`Received message from ${userId}: ${msg}`);

        const lowerMsg = msg.toLowerCase();

        // Store user message in chat history
        chatHistory[userId].push({ speaker: 'user', message: msg });

        // Logic to find response based on user message
        let response = responses.find(res => {
            if (res.user_input.some(input => lowerMsg.includes(input))) {
                return res.required_words.every(word => lowerMsg.includes(word));
            }
            return false;
        });

        if (response) {
            // Reset consecutive failures on successful response
            sessionContext[userId].consecutiveFailures = 0;
            console.log(`Sending response to ${userId}: ${response.bot_response}`);
            io.to(userId).emit('chat message', response.bot_response);
            // Store bot response in chat history
            chatHistory[userId].push({ speaker: 'bot', message: response.bot_response });
            console.log(chatHistory[userId]);
        } else {
            // Increment consecutive failures and check for hard fallback
            sessionContext[userId].consecutiveFailures++;
            if (sessionContext[userId].consecutiveFailures >= maxFailures) {
                console.log(`Hard fallback triggered for ${userId}.`);
                io.to(userId).emit('hard fallback');
                // Clear chat history on hard fallback
                chatHistory[userId] = [];
                // Reset consecutive failures
                sessionContext[userId].consecutiveFailures = 0;
            } else {
                const defaultResponse = "I don't understand.";
                console.log(`Sending default response to ${userId}: ${defaultResponse}`);
                io.to(userId).emit('chat message', defaultResponse);
                // Store default response in chat history
                chatHistory[userId].push({ speaker: 'bot', message: defaultResponse });
            }
        }
    });

    // Event listener for user disconnect
    socket.on('disconnect', () => {
        console.log(`User disconnected: ${userId}`);
        delete sessionContext[userId]; // Clean up session context
        // Optionally, you can choose to keep or delete chat history here
        // delete chatHistory[userId];
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

