import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// --- ES Module Path Resolution ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Calculate path to the root .env (two levels up from backend/config)
const envPath = path.resolve(__dirname, "..", ".env");

// --- Load .env ---
const result = dotenv.config({ path: envPath });

if (result.error) {
	console.error("FATAL .ENV ERROR:", result.error.message);
	// You can uncomment the line below to see all attempts at loading if it fails.
	// console.log("Attempted .env path:", envPath);
	process.exit(1);
}

// Check the status of your specific variable
console.log(
	"GOOGLE_CLIENT_ID Status (Loader):",
	process.env.GOOGLE_CLIENT_ID ? "LOADED" : "UNDEFINED"
);
console.log(
	"MONGODB_URI Status (Loader):",
	process.env.MONGO_URI ? "LOADED" : "UNDEFINED"
);
