const express = require("express");
const router = express.Router();
const Post = require("../models/Post");
const verifyToken = require("../authMiddleware");
const uploadBlogImage = require("../middleware/uploadBlogImage");

// Upload featured image for blog post (protected)
router.post("/upload-image", verifyToken, uploadBlogImage, (req, res) => {
	try {
		if (!req.file) {
			return res.status(400).json({
				success: false,
				message: "No image file uploaded",
			});
		}

		const imageUrl = req.file.secure_url || req.file.path;

		res.status(200).json({
			success: true,
			imageUrl,
			message: "Featured image uploaded successfully",
		});
	} catch (err) {
		console.error("Blog image upload error:", err);
		res.status(500).json({
			success: false,
			message: "Server error during image upload",
		});
	}
});

// GET all posts
router.get("/", async (req, res) => {
	try {
		const { authorId } = req.query;
		let query = {};
		if (authorId) query.authorId = authorId;

		const posts = await Post.find(query)
			.populate("authorId", "displayName")
			.sort({ publicationDate: -1 });

		res.json(
			posts.map((post) => ({
				id: post._id,
				title: post.title,
				content: post.content,
				imageUrl: post.imageUrl,
				publicationDate: post.publicationDate,
				tags: post.tags,
				likes: post.likes,
				authorName: post.authorId?.displayName || "Unknown",
				authorId: post.authorId?._id,
			}))
		);
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
});

// GET one post by ID
router.get("/:id", async (req, res) => {
	try {
		const post = await Post.findById(req.params.id).populate(
			"authorId",
			"displayName email photoURL"
		); // Populate user data

		if (!post) {
			return res.status(404).json({ message: "Post not found" });
		}

		// Format response to match what frontend expects
		res.json({
			id: post._id.toString(),
			title: post.title,
			content: post.content,
			imageUrl: post.imageUrl || null,
			publicationDate: post.publicationDate,
			tags: post.tags || [],
			likes: post.likes,
			authorId: post.authorId?._id.toString(),
			authorName: post.authorId?.displayName || "Unknown User",
			authorPhoto: post.authorId?.photoURL || null,
		});
	} catch (err) {
		res.status(500).json({ message: "Server error" });
	}
});

// POST create new post (Protected)
router.post("/", verifyToken, async (req, res) => {
	const post = new Post({
		title: req.body.title,
		content: req.body.content,
		authorId: req.userId, // From middleware
		authorName: req.body.authorName,
		imageUrl: req.body.imageUrl,
		tags: req.body.tags,
	});

	try {
		const newPost = await post.save();
		res.status(201).json(newPost);
	} catch (err) {
		res.status(400).json({ message: err.message });
	}
});

// PUT update post (Protected)
router.put("/:id", verifyToken, async (req, res) => {
	try {
		const post = await Post.findById(req.params.id);
		if (!post) return res.status(404).json({ message: "Post not found" });

		console.log("DEBUG: Update Post", {
			postId: post._id,
			postAuthorId: post.authorId,
			postAuthorIdString: post.authorId?.toString(),
			reqUserId: req.userId,
			match: post.authorId?.toString() === req.userId,
		});

		// Check if user is author
		if (post.authorId.toString() !== req.userId) {
			return res
				.status(403)
				.json({ message: "Not authorized to update this post" });
		}

		if (req.body.title) post.title = req.body.title;
		if (req.body.content) post.content = req.body.content;
		if (req.body.imageUrl) post.imageUrl = req.body.imageUrl;
		if (req.body.tags) post.tags = req.body.tags;

		const updatedPost = await post.save();
		res.json(updatedPost);
	} catch (err) {
		res.status(400).json({ message: err.message });
	}
});

// DELETE post (Protected)
router.delete("/:id", verifyToken, async (req, res) => {
	try {
		const post = await Post.findById(req.params.id);
		if (!post) return res.status(404).json({ message: "Post not found" });

		// Check if user is author
		if (post.authorId.toString() !== req.userId) {
			return res
				.status(403)
				.json({ message: "Not authorized to delete this post" });
		}

		await post.deleteOne();
		res.json({ message: "Post deleted" });
	} catch (err) {
		res.status(500).json({ message: err.message });
	}
});

module.exports = router;
