// models/Post.js - This is the blog post model
const mongoose = require("mongoose");

const postSchema = new mongoose.Schema({
	title: { type: String, required: true },
	content: { type: String, required: true },
	authorId: {
		type: mongoose.Schema.Types.ObjectId,
		ref: "User",
		required: true,
	}, // ← Change to ObjectId + ref
	imageUrl: String,
	publicationDate: { type: Date, default: Date.now },
	tags: [String],
	likes: { type: Number, default: 0 },
});

module.exports = mongoose.model("Post", postSchema);
