const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

// ✅ Supabase Configuration
const supabase = createClient(
  "https://jhtuphbiequoyetntvak.supabase.co",
  "sb_publishable_9jUmex1UCcQHVne2CuuF1Q_EbUJ1zMR"
);

// ✅ Admin Password (Change this to your desired password)
const ADMIN_PASSWORD = "admin123";

// 👉 Root check
app.get("/", (req, res) => {
  res.send("Server Running ✅");
});

// 👉 Auto key generator (16 characters: A-Z, 0-9)
function generateKey() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result.replace(/(.{4})(?=.)/g, '$1-');
}

// 👉 Verify Admin Password API
app.post("/admin/verify", (req, res) => {
  try {
    const { password } = req.body;
    
    if (password === ADMIN_PASSWORD) {
      res.json({ 
        success: true, 
        message: "Admin verified successfully" 
      });
    } else {
      res.json({ 
        success: false, 
        message: "Invalid admin password" 
      });
    }
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// 👉 Generate Key API (Protected by password)
app.post("/generate", async (req, res) => {
  try {
    const { key, expiry, adminPassword } = req.body;

    // Verify admin password
    if (adminPassword !== ADMIN_PASSWORD) {
      return res.status(403).json({ 
        success: false, 
        error: "Unauthorized: Invalid admin password" 
      });
    }

    const newKey = key || generateKey();

    const { data, error } = await supabase
      .from("Sddgamer")
      .insert([
        {
          key: newKey,
          expiry: expiry || "9999-12-31",
          status: "active",
          created_at: new Date().toISOString()
        },
      ])
      .select();

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({
      success: true,
      key: newKey,
      message: "Key generated successfully",
      data,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 👉 Check Key API
app.post("/check", async (req, res) => {
  try {
    const { key } = req.body;

    const { data, error } = await supabase
      .from("Sddgamer")
      .select("*")
      .eq("key", key)
      .single();

    if (error || !data) {
      return res.json({ valid: false, message: "Key not found" });
    }

    if (data.status !== "active") {
      return res.json({ 
        valid: false, 
        message: "Key is inactive/expired",
        data 
      });
    }

    // Check expiry
    if (data.expiry && new Date(data.expiry) < new Date()) {
      return res.json({ 
        valid: false, 
        message: "Key has expired",
        data 
      });
    }

    res.json({
      valid: true,
      message: "Key is valid",
      data,
    });
  } catch (err) {
    res.json({ valid: false, message: "Error checking key" });
  }
});

// 👉 Get All Keys API (Protected)
app.post("/admin/keys", async (req, res) => {
  try {
    const { adminPassword } = req.body;

    if (adminPassword !== ADMIN_PASSWORD) {
      return res.status(403).json({ 
        success: false, 
        error: "Unauthorized: Invalid admin password" 
      });
    }

    const { data, error } = await supabase
      .from("Sddgamer")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({
      success: true,
      keys: data,
      total: data.length
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 👉 Delete Key API (Protected)
app.post("/admin/delete-key", async (req, res) => {
  try {
    const { key, adminPassword } = req.body;

    if (adminPassword !== ADMIN_PASSWORD) {
      return res.status(403).json({ 
        success: false, 
        error: "Unauthorized: Invalid admin password" 
      });
    }

    const { data, error } = await supabase
      .from("Sddgamer")
      .delete()
      .eq("key", key)
      .select();

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    if (data.length === 0) {
      return res.json({ 
        success: false, 
        message: "Key not found" 
      });
    }

    res.json({
      success: true,
      message: "Key deleted successfully",
      deleted: data
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 👉 Update Key Status API (Protected)
app.post("/admin/update-key", async (req, res) => {
  try {
    const { key, status, adminPassword } = req.body;

    if (adminPassword !== ADMIN_PASSWORD) {
      return res.status(403).json({ 
        success: false, 
        error: "Unauthorized: Invalid admin password" 
      });
    }

    const { data, error } = await supabase
      .from("Sddgamer")
      .update({ status: status })
      .eq("key", key)
      .select();

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    res.json({
      success: true,
      message: "Key updated successfully",
      data
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 👉 Port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});