const jwt = require("jsonwebtoken");

const verifyToken = (req, res, next) => {
	// 1. Get token from header
	const token = req.header("Authorization")?.replace("Bearer ", "");
	// console.log("Verifying token:", token);

	// 2. Check if no token
	if (!token) {
		return res.status(401).json({ message: "No token, authorization denied" });
	}

	// 3. Verify token
	try {
		const decoded = jwt.verify(
			token,
			process.env.JWT_SECRET || "toto99blog@12345"
		);
		req.userId = decoded.userId;
		next();
	} catch (err) {
		res.status(401).json({ message: "Token is not valid" });
	}
};

module.exports = verifyToken;
