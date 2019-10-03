'use strict'
const express = require('express')
const app = express()
const server = require('http').createServer(app)
const path = require('path')
const io = require('socket.io')(server)
const port = 3000;
const jsdom = require('jsdom');
const { JSDOM } = jsdom;
app.use(express.static(path.join(__dirname, '')))
server.listen(port, () => {
  console.log(`Server running on port ${port}.`)
})

io.on('connection', (socket) => {
  console.log('Socket connected.');
  const { document } = (new JSDOM(`...`)).window;

  socket.on('input', (data) => {
    console.log(data);
  });
});