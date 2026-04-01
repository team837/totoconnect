const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const session = require("express-session");

dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:3000",
  "http://localhost:49866"
];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow requests with no origin (like Postman)
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      } else {
        return callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  })
);

// Add this after app.use(express.json());
app.use(
	session({
		secret: process.env.SESSION_SECRET || "toto99blog",
		resave: false,
		saveUninitialized: false, // ← changed: prevents empty sessions
		cookie: {
			secure: process.env.NODE_ENV === "production",
			httpOnly: true,
			sameSite: "lax",
			maxAge: 10 * 60 * 1000, // match your 10-min state lifetime
		},
	})
);
app.use(express.json());

const postRoutes = require("./routes/postRoutes");
const routeRoutes = require("./routes/routeRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const driverRoutes = require("./routes/driverRoutes");
const bookingRoutes = require("./routes/bookingRoutes");
const settingsRoutes = require("./routes/settingsRoutes");
const supportRoutes = require("./routes/supportRoutes");
const paymentRoutes = require("./routes/paymentRoutes");

app.use("/api/posts", postRoutes);
app.use("/api/routes", routeRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/drivers", driverRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/settings", settingsRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/payment", paymentRoutes);


app.get("/", (req, res) => {
	res.send("TotoConnect Backend API is running.");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
	console.log(`Server is running on port ${PORT}`);
	console.log(`Access the API at http://localhost:${PORT}`);
});
