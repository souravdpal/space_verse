const mongoose = require('mongoose');
const notify = new mongoose.Schema({
    id : String,                            // ✅ user ID
    message : String,
    category : String,
    time : { type: Date, default: Date.now },
    status : { type: Boolean, default: false }
});
module.exports = mongoose.model('Notification', notify); // ✅ USE capital 'Notification'
