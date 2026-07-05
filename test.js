const express = require('express');
const app = express();

app.get('/', (req, res) => res.send('Testet fungerar!'));

app.listen(3007, () => {
    console.log('Minimal testserver startad på port 3007');
});