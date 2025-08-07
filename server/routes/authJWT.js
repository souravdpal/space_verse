const jwt = require('jsonwebtoken')

const auth = (req, res, next) => {
    const authHeaders = req.headers['auth']
    const token = authHeaders?.split('')[1]
    if (!token) {
        return res.status(401).json({ error: "Unauthorised acceses by user!" })

    }
    try {
        const decode = jwt.verify(token, process.env.JWT_S);
        req.user = decode;
        next();
    } catch (err) {
        return req.status(403).json({ error: "invalid req error in token" })
    }
}


module.exports=auth;