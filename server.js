require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");
// const bodyParser = require("body-parser");
const cors = require("cors");
const googleTTS = require("google-tts-api");
const axios = require("axios");
const app = express();

app.use(express.json());
app.use(cookieParser());
// app.use(bodyParser.json());

app.use(
  cors({
    origin: "http://localhost:3000",
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
  })
);
// MongoDB Atlas Connection
mongoose
  .connect(process.env.MONGO_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("Connected to MongoDB Atlas"))
  .catch((err) => console.error("Error connecting to MongoDB:", err));

// ======= USER MODEL =======
const UserSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4, unique: true }, // Automatically generate a UUID
  email: { type: String, required: true, unique: true }, // User's email must be unique and is required
  password: { type: String, required: true }, // Hashed user password
  role: { type: String, default: "user" }, // User role, default is "user"
  refreshTokens: [String], // Array to store refresh tokens for the user
});
const User = mongoose.model("User", UserSchema);

// ======= DEFAULT WORD MODEL =======
const defaultWordSchema = new mongoose.Schema({
  courseName: { type: String, required: true }, // Course name
  lessonName: { type: String, required: true }, // Lesson name
  word: { type: String, required: true }, // The word itself
  translation: { type: String, required: true }, // Translation of the word
});
const DefaultWord = mongoose.model("DefaultWord", defaultWordSchema);

// ======= USER WORD DATA MODEL =======
const wordSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // User ID
  courseName: { type: String, required: true }, // Course name
  lessonName: { type: String, required: true }, // Lesson name
  word: { type: String, required: true }, // The word itself
  translation: { type: String, required: true }, // Translation of the word
  repeats: { type: Number, default: 0 }, // Number of times the word has been repeated
});

// ======= LESSON PROGRESS MODEL =======
const lessonProgressSchema = new mongoose.Schema({
  userId: { type: String, required: true }, // User ID
  courseName: { type: String, required: true }, // Course name
  lessonName: { type: String, required: true }, // Lesson name
  repeats: { type: Number, default: 0 }, // Number of times the lesson has been repeated
});
const LessonProgress = mongoose.model("LessonProgress", lessonProgressSchema);
const Word = mongoose.model("Word", wordSchema);

// ======= TOKEN GENERATION =======
const generateAccessToken = (user) => {
  return jwt.sign(
    { userId: user.id, role: user.role }, // Use user.id and include role in the payload
    process.env.ACCESS_SECRET, // Secret key for access token
    { expiresIn: "15m" } // Token expires in 15 minutes
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { userId: user.id }, // Only include userId in the refresh token
    process.env.REFRESH_SECRET, // Secret key for refresh token
    { expiresIn: "14d" } // Token expires in 14 days
  );
};

// ======= REGISTRATION =======
app.post("/auth/register", async (req, res) => {
  try {
    const { email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10); // Hash the password before saving

    const user = new User({
      email,
      password: hashedPassword,
      refreshTokens: [], // Initialize with an empty refresh token array
    });

    await user.save(); // Save the user to the database
    res.status(201).json({ message: "User registered", userId: user.id });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error registering user", error: error.message });
  }
});

// ======= LOGIN =======
app.post("/auth/login", async (req, res) => {
  const { email, password } = req.body;

  // Find the user by email
  const user = await User.findOne({ email });

  // If user doesn't exist or password is incorrect
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ message: "Invalid credentials" });
  }

  // Generate access and refresh tokens
  const accessToken = generateAccessToken(user);
  const refreshToken = generateRefreshToken(user);

  // ✅ Add the new refreshToken to user's token list
  user.refreshTokens.push(refreshToken);
  await user.save();

  // ✅ Store the refresh token in an HttpOnly cookie
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true, // Cannot be accessed via JavaScript
    secure: true, // Sent only over HTTPS
    sameSite: "Strict", // Prevent CSRF
  });

  // ✅ Send access token to client
  res.json({ accessToken });
});

// ======= REFRESH TOKENS =======
app.post("/auth/refresh", async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  // ✅ Check if the refresh token is present
  if (!refreshToken) return res.sendStatus(401); // Unauthorized

  try {
    // ✅ Verify refresh token using the REFRESH_SECRET
    const decoded = jwt.verify(refreshToken, process.env.REFRESH_SECRET);

    // ✅ Find the user and check if token exists in their saved tokens
    const user = await User.findOne({
      id: decoded.userId,
      refreshTokens: { $in: [refreshToken] },
    });

    // ✅ If token is invalid or user not found
    if (!user) {
      return res.sendStatus(403); // Forbidden
    }

    // ✅ Remove the old refresh token from user's list
    user.refreshTokens = user.refreshTokens.filter(
      (token) => token !== refreshToken
    );

    // ✅ Generate new access and refresh tokens
    const newAccessToken = generateAccessToken(user);
    const newRefreshToken = generateRefreshToken(user);

    // ✅ Save the new refresh token
    user.refreshTokens.push(newRefreshToken);
    await user.save();

    // ✅ Send the new refresh token in a secure HttpOnly cookie
    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: "Strict",
    });

    // ✅ Return the new access token
    res.json({ accessToken: newAccessToken });
  } catch {
    res.sendStatus(403); // Token invalid or expired
  }
});

// ======= LOGOUT =======
app.post("/auth/logout", async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  // ✅ If no refresh token, there's nothing to log out — just send 204 No Content
  if (!refreshToken) return res.sendStatus(204);

  // ✅ Find the user who has this refresh token
  const user = await User.findOne({ refreshTokens: { $in: [refreshToken] } });

  if (user) {
    // ✅ Remove the used refresh token from the user's list
    user.refreshTokens = user.refreshTokens.filter(
      (token) => token !== refreshToken
    );
    await user.save();
  }

  // ✅ Clear the refresh token cookie on the client
  res.clearCookie("refreshToken");
  res.sendStatus(204); // No Content
});

// ======= PROTECTED ROUTE MIDDLEWARE =======
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // ✅ Check if Authorization header exists and starts with "Bearer"
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.sendStatus(401); // Unauthorized
  }

  // ✅ Extract token from header
  const token = authHeader.split(" ")[1];

  // ✅ Verify the token using the access secret
  jwt.verify(token, process.env.ACCESS_SECRET, (err, decoded) => {
    if (err) return res.sendStatus(403); // Invalid or expired token
    req.user = decoded; // Attach user data to request
    next(); // Proceed to the route
  });
};

// ======= PROTECTED ENDPOINT EXAMPLE =======
app.get("/protected", authMiddleware, (req, res) => {
  res.json({ message: "This is a protected route", user: req.user });
});

// ======= WORDS ENDPOINT - ADD A WORD =======
app.post("/words", async (req, res) => {
  try {
    const { userId, courseName, lessonName, word, translation } = req.body;

    // ✅ Create a new word for the user
    const newWord = new Word({
      userId,
      courseName,
      lessonName,
      word,
      translation,
      repeats: 0, // Initialize repeat count
    });

    await newWord.save(); // Save to DB
    res.status(201).json({ message: "Word added", word: newWord });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error adding word", error: error.message });
  }
});

// ======= GET WORDS BY USER ID =======
app.get("/words/:userId", async (req, res) => {
  try {
    const words = await Word.find({ userId: req.params.userId }); // Find all words for the user
    res.json(words);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching words", error: error.message });
  }
});

// ======= GET USER COURSES (START OF ENDPOINT) =======
app.get("/courses/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const courses = await Word.distinct("courseName", { userId });

    res.json({ courses });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching courses", error: error.message });
  }
});

// ======= GET UNIQUE COURSE NAMES FOR USER =======
app.get("/courses/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // ✅ Get unique course names for the user
    const courses = await Word.distinct("courseName", { userId });

    res.json({ courses });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching courses", error: error.message });
  }
});

// ======= GET UNIQUE LESSON NAMES FOR A COURSE =======
app.get("/lessons/:userId/:courseName", async (req, res) => {
  try {
    const { userId, courseName } = req.params;

    // ✅ Get unique lesson names for the given course and user
    const lessons = await Word.distinct("lessonName", { userId, courseName });

    res.json({ lessons });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching lessons", error: error.message });
  }
});

// ======= LOAD DEFAULT WORDS FOR NEW USER =======
app.post("/load-defaults", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ message: "User ID is required" });
    }

    // ✅ Check if words have already been loaded for the user
    const existingWords = await Word.findOne({ userId });
    if (existingWords) {
      return res
        .status(400)
        .json({ message: "Words already loaded for this user" });
    }

    // ✅ Get all default words
    const defaultWords = await DefaultWord.find();
    if (!defaultWords.length) {
      return res.status(404).json({ message: "No default words found" });
    }

    // ✅ Prepare user-specific word entries
    const userWords = defaultWords.map((word) => ({
      id: uuidv4(),
      userId,
      courseName: word.courseName,
      lessonName: word.lessonName,
      word: word.word,
      translation: word.translation,
      repeats: 0,
    }));

    // ✅ Save them to the database
    await Word.insertMany(userWords);
    res
      .status(201)
      .json({ message: "Courses and words loaded", words: userWords });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error loading default words", error: error.message });
  }
});

// ======= GET WORDS BY USER, COURSE AND LESSON =======
app.get("/words/:userId/:courseName/:lessonName", async (req, res) => {
  try {
    const words = await Word.find({
      userId: req.params.userId,
      courseName: req.params.courseName,
      lessonName: req.params.lessonName,
    });
    res.json(words);
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error fetching words", error: error.message });
  }
});

// ======= ADMIN: ADD DEFAULT WORDS =======
app.post("/admin/words", async (req, res) => {
  try {
    const insertedWords = await DefaultWord.insertMany(req.body);
    res
      .status(201)
      .json({ message: "Default words uploaded", words: insertedWords });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error uploading default words", error: error.message });
  }
});

// ======= CREATE LESSON PROGRESS RECORD =======
app.post("/lesson-progress", async (req, res) => {
  try {
    const { userId, courseName, lessonName } = req.body;

    const existing = await LessonProgress.findOne({
      userId,
      courseName,
      lessonName,
    });
    if (existing) {
      return res
        .status(400)
        .json({ message: "Progress already exists for this lesson" });
    }

    const progress = new LessonProgress({ userId, courseName, lessonName });
    await progress.save();
    res.status(201).json({ message: "Lesson progress created", progress });
  } catch (error) {
    res.status(500).json({
      message: "Error creating lesson progress",
      error: error.message,
    });
  }
});

// ======= UPDATE LESSON REPEATS (RESET OR SET) =======
app.put("/lesson-progress", async (req, res) => {
  try {
    const { userId, courseName, lessonName, repeats } = req.body;

    const progress = await LessonProgress.findOneAndUpdate(
      { userId, courseName, lessonName },
      { repeats },
      { new: true }
    );

    if (!progress) {
      return res.status(404).json({ message: "Progress not found" });
    }

    res.json({ message: "Repeats updated", progress });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error updating repeats", error: error.message });
  }
});

// ======= INCREMENT LESSON REPEATS (+1 or create if not exist) =======
app.patch("/lesson-progress/increment", async (req, res) => {
  try {
    const { userId, courseName, lessonName } = req.body;

    const progress = await LessonProgress.findOneAndUpdate(
      { userId, courseName, lessonName },
      { $inc: { repeats: 1 } },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      }
    );

    res.json({ message: "Repeats incremented or created", progress });
  } catch (error) {
    res
      .status(500)
      .json({ message: "Error incrementing repeats", error: error.message });
  }
});

// ======= GET LESSON PROGRESS BY COURSE =======
app.get("/lesson-progress/:userId/:courseName", async (req, res) => {
  try {
    const { userId, courseName } = req.params;
    const progress = await LessonProgress.find({ userId, courseName });
    res.json(progress);
  } catch (error) {
    res.status(500).json({
      message: "Error fetching lesson progress",
      error: error.message,
    });
  }
});

// ======= TEXT-TO-SPEECH: RETURN AUDIO STREAM =======
app.get("/speak/:word", async (req, res) => {
  const { word } = req.params;

  try {
    const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(
      word
    )}&tl=en&client=tw-ob`;

    const response = await axios.get(url, {
      responseType: "stream",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      },
    });

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Disposition": `inline; filename="${word}.mp3"`,
    });

    response.data.pipe(res);
  } catch (error) {
    console.error("Error retrieving speech audio:", error.message);
    res.status(500).json({ message: "Error generating speech" });
  }
});

// ======= SERVER START =======
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// // Routes
// const cardRoutes = require("./routes/cards");
// app.use("/api/words", cardRoutes);
// const proxyRoute = require("./routes/proxy");
// app.use("/api", proxyRoute);

// const PORT = 5000;
// app.listen(PORT, () =>
//   console.log(`Server running on http://localhost:${PORT}`)
// );
