const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const storage = new CloudinaryStorage({
	cloudinary: cloudinary,
	params: (req, file) => ({
		folder: "toto/posts/featured", // different folder = better organization
		allowed_formats: ["jpg", "jpeg", "png", "webp"],
		transformation: [
			{ width: 1200, height: 630, crop: "limit" }, // good size for blog featured images & social sharing
			{ quality: "auto:good" },
			{ fetch_format: "auto" },
		],
		// Optional: unique name using user id + timestamp
		public_id: `featured-${req.userId || "anonymous"}-${Date.now()}`,
	}),
});

const uploadBlogImage = multer({
	storage: storage,
	limits: { fileSize: 8 * 1024 * 1024 }, // 8MB – reasonable for blog images
	fileFilter: (req, file, cb) => {
		if (file.mimetype.startsWith("image/")) {
			cb(null, true);
		} else {
			cb(new Error("Only image files are allowed!"), false);
		}
	},
}).single("blogImage"); // ← field name we'll use in FormData

module.exports = uploadBlogImage;
