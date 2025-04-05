const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + path.extname(file.originalname)),
});

const upload = multer({ storage });

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "cdac@123",
  database: "easygo",
});

db.connect((err) => {
  if (err) console.error("Error connecting to database:", err);
  else console.log("Connected to database!");
});

app.use("/uploads", express.static(uploadDir));

const getTableName = (department) => {
  const tables = {
    agriculture: "agriculture",
    espcontroller: "espcontroller",
    gasmonitor: "gasmonitor",
    embeddedsystem: "embeddedsystem",
  };
  return tables[department] || null;
};

// Add Product
app.post(
  "/addProduct",
  upload.fields([{ name: "photo" }, { name: "specification" }]),
  (req, res) => {
    const { name, description, department } = req.body;
    const tableName = getTableName(department);
    if (!tableName) return res.status(400).send("Invalid department selected.");

    const photo = req.files.photo?.[0]?.filename || null;
    const specification = req.files.specification?.[0]?.filename || null;

    const query = `INSERT INTO ${tableName} (name, description, department, photo, specification) VALUES (?, ?, ?, ?, ?)`;
    db.query(
      query,
      [name, description, department, photo, specification],
      (err) => {
        if (err) {
          console.error("Error inserting product:", err);
          return res.status(500).send("Error inserting product");
        }
        res.status(201).send("Product added successfully");
      }
    );
  }
);

// Fetch all products
app.get("/products", async (req, res) => {
  const tables = [
    "agriculture",
    "espcontroller",
    "gasmonitor",
    "embeddedsystem",
  ];
  let products = [];

  try {
    for (const table of tables) {
      const [rows] = await db.promise().query(`SELECT * FROM ${table}`);
      products = [...products, ...rows];
    }

    const productsWithURLs = products.map((product) => ({
      ...product,
      photo: product.photo
        ? `${req.protocol}://${req.get("host")}/uploads/${product.photo}`
        : null,
      specification: product.specification
        ? `${req.protocol}://${req.get("host")}/uploads/${
            product.specification
          }`
        : null,
    }));

    res.json(productsWithURLs);
  } catch (error) {
    console.error("Error fetching products:", error);
    res.status(500).send("Error fetching products");
  }
});

// Update Product
app.put(
  "/updateProduct/:id",
  upload.fields([{ name: "photo" }, { name: "specification" }]),
  async (req, res) => {
    const { id } = req.params;
    const { name, description, department } = req.body;
    const tableName = getTableName(department);

    if (!tableName) return res.status(400).send("Invalid department selected.");

    const photo = req.files.photo?.[0]?.filename || null;
    const specification = req.files.specification?.[0]?.filename || null;

    try {
      const [rows] = await db
        .promise()
        .query(`SELECT photo, specification FROM ${tableName} WHERE id = ?`, [
          id,
        ]);
      if (!rows.length) return res.status(404).send("Product not found");

      const oldPhoto = rows[0].photo;
      const oldSpecification = rows[0].specification;

      if (photo && oldPhoto)
        fs.unlink(path.join(uploadDir, oldPhoto), () => {});
      if (specification && oldSpecification)
        fs.unlink(path.join(uploadDir, oldSpecification), () => {});

      const query = `UPDATE ${tableName} SET name = ?, description = ?, department = ?, photo = ?, specification = ? WHERE id = ?`;
      await db
        .promise()
        .query(query, [
          name,
          description,
          department,
          photo,
          specification,
          id,
        ]);

      res.status(200).send("Product updated successfully");
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).send("Error updating product");
    }
  }
);

// Delete Product
app.delete("/deleteProduct/:id", async (req, res) => {
  const { id } = req.params;

  const tables = [
    "agriculture",
    "espcontroller",
    "gasmonitor",
    "embeddedsystem",
  ];
  let productFound = false;

  try {
    for (const table of tables) {
      try {
        const [rows] = await db
          .promise()
          .query(`SELECT photo, specification FROM ${table} WHERE id = ?`, [
            id,
          ]);

        if (!rows.length) continue;

        productFound = true;

        // Convert buffer to string if necessary
        const photo = rows[0].photo ? rows[0].photo.toString() : null;
        const specification = rows[0].specification
          ? rows[0].specification.toString()
          : null;

        // Delete files safely
        if (photo)
          fs.unlink(path.join(uploadDir, photo), (err) => {
            if (err) console.error(err);
          });
        if (specification)
          fs.unlink(path.join(uploadDir, specification), (err) => {
            if (err) console.error(err);
          });

        await db.promise().query(`DELETE FROM ${table} WHERE id = ?`, [id]);

        res.status(200).send("Product deleted successfully");
        return;
      } catch (err) {
        console.error(`Error deleting from ${table}:`, err);
      }
    }

    if (!productFound) {
      res.status(404).send("Product not found");
    }
  } catch (error) {
    console.error("Error deleting product:", error);
    res.status(500).send("Error deleting product");
  }
});




// db.connect((err) => {
//   if (err) {
//     console.error("Error connecting to the database:", err);
//     return;
//   }
//   console.log("Connected to the database");
// });

// // Set up multer for file upload (save uploaded files in a 'uploads' directory)
// const storage = multer.memoryStorage(); // Store files in memory for easy processing
// const upload = multer({ storage: storage });

// Sample API endpoint
app.get("/api/data", (req, res) => {
  db.query("SELECT * FROM contactus", (err, results) => {
    if (err) {
      console.error(err);
      res.status(500).send("Server error");
    } else {
      res.json(results);
    }
  });
});

app.post("/api/contactus", (req, res) => {
  const { name, email, subject, message } = req.body;

  // Validate the data
  if (!name || !email || !subject || !message) {
    return res.status(400).json({ error: "All fields are required" });
  }

  // Insert the data into the contactus table
  const query =
    "INSERT INTO contactus (name, email, subject, message) VALUES (?, ?, ?, ?)";
  db.query(query, [name, email, subject, message], (err, result) => {
    if (err) {
      console.error("Error inserting data:", err);
      return res
        .status(500)
        .json({ error: "Failed to insert data into the database" });
    }

    // Send success response
    res
      .status(200)
      .json({ message: "Thank you for contacting us!", id: result.insertId });
  });
});

// POST route for applying
app.post("/api/applynow", upload.single("resume"), (req, res) => {
  const { firstname, lastname, email, phone, address, city, country, message } =
    req.body;
  const resume = req.file ? req.file.filename : null; // Store file name

  console.log("Received data:", req.body);
  console.log(
    "Uploaded file:",
    req.file ? req.file.filename : "No file uploaded"
  );

  if (
    !firstname ||
    !lastname ||
    !email ||
    !phone ||
    !address ||
    !city ||
    !country ||
    !message
  ) {
    console.error("Validation failed: Missing required fields");
    return res.status(400).json({ error: "All fields are required" });
  }

  // Check if email already exists
  const checkEmailQuery = "SELECT * FROM applynow WHERE email = ?";
  db.query(checkEmailQuery, [email], (err, result) => {
    if (err) {
      console.error("Error checking email:", err);
      return res.status(500).json({ error: "Failed to check email" });
    }

    if (result.length > 0) {
      console.warn("Duplicate email detected:", email);
      return res.status(400).json({ error: "Email already exists" });
    }

    // Insert new record if email doesn't exist
    const insertQuery = `
      INSERT INTO applynow (firstname, lastname, email, phone, address, city, country, message, resume)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.query(
      insertQuery,
      [
        firstname,
        lastname,
        email,
        phone,
        address,
        city,
        country,
        message,
        resume,
      ],
      (err, result) => {
        if (err) {
          console.error("Error inserting data:", err);
          return res.status(500).json({ error: "Failed to insert data" });
        }

        console.log("Data successfully inserted:", result);
        res
          .status(200)
          .json({
            message: "Application submitted successfully!",
            id: result.insertId,
          });
      }
    );
  });
});




app.get("/api/contactus", (req, res) => {
  db.query("SELECT * FROM contactus", (err, results) => {
    if (err) {
      console.error("Error fetching contact data:", err);
      return res.status(500).send("Server error");
    } else {
      res.json(results); // Send back the data as JSON
    }
  });
});



app.get("/api/applynow", (req, res) => {
  db.query("SELECT * FROM applynow", (err, results) => {
    if (err) {
      console.error("Error fetching apply form data:", err);
      return res.status(500).send("Server error");
    } else {
      res.json(results); // Send back the data as JSON
    }
  });
});

//to show total no of count

app.get("/api/applynow/count", (req, res) => {
  const query = "SELECT COUNT(*) AS count FROM applynow";

  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching career enquiry count:", err);
      return res.status(500).json({ error: "Failed to fetch count" });
    }
    res.json({ count: results[0].count });
  });
});

app.get("/api/contactus/count", (req, res) => {
  const query = "SELECT COUNT(*) AS count FROM contactus";

  db.query(query, (err, results) => {
    if (err) {
      console.error("Error fetching contact submission count:", err);
      return res.status(500).json({ error: "Failed to fetch count" });
    }
    res.json({ count: results[0].count });
  });
});

// Fetch job vacancies
app.get("/api/vacancies", (req, res) => {
  const sql = "SELECT * FROM JobVacancies";
  db.query(sql, (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(result);
  });
});

// Add a new job vacancy
app.post("/api/vacancies", (req, res) => {
  const { jobRole, jobDescription, noOfVacancies } = req.body;
  const sql = "INSERT INTO JobVacancies (jobRole, jobDescription, noOfVacancies) VALUES (?, ?, ?)";
  db.query(sql, [jobRole, jobDescription, noOfVacancies], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.status(201).json({ message: "Job vacancy added successfully", id: result.insertId });
  });
});


  

// Start server
app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
