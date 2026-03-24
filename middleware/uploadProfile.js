const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/cloudinary");

const storage = new CloudinaryStorage({
	cloudinary,
	params: (req, file) => ({
		folder: "toto/users/profiles",
		allowed_formats: ["jpg", "jpeg", "png", "webp"],
		transformation: [
			{ width: 512, height: 512, crop: "fill", gravity: "face" },
			{ quality: "auto:good" },
			{ fetch_format: "auto" },
		],
		public_id: `${req.userId}-${Date.now()}`,
	}),
});

const uploadProfile = multer({
	storage,
	limits: { fileSize: 6 * 1024 * 1024 }, // 6MB
}).single("profilePicture");

module.exports = uploadProfile;
