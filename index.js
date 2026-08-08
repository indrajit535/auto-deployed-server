const express = require("express");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  "https://jhtuphbiequoyetntvak.supabase.co",
  "sb_publishable_9jUmex1UCcQHVne2CuuF1Q_EbUJ1zMR"
);

// ✅ Admin Password Change Kiya - SDD213
const ADMIN_PASSWORD = "SDD213";

app.get("/", (req, res) => {
  res.send("Server Running ✅");
});

// Generate Key
app.post("/generate", async (req, res) => {
  try {
    const { key, expiry, adminPassword } = req.body;

    if (adminPassword !== ADMIN_PASSWORD) {
      return res.json({ success: false, error: "Wrong password" });
    }

    const newKey = key;

    const { data, error } = await supabase
      .from("Sddgamer")
      .insert([{ 
        key: newKey, 
        expiry: expiry || "9999-12-31",
        status: "active",
        created_at: new Date().toISOString()
      }])
      .select();

    if (error) {
      return res.json({ success: false, error: error.message });
    }

    res.json({ success: true, key: newKey, data });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Check Key
app.post("/check", async (req, res) => {
  try {
    const { key } = req.body;

    const { data, error } = await supabase
      .from("Sddgamer")
      .select("*")
      .eq("key", key)
      .maybeSingle();

    if (error) {
      return res.json({ valid: false, message: "Error" });
    }

    if (!data) {
      return res.json({ valid: false, message: "Key not found" });
    }

    res.json({ 
      valid: data.status === "active", 
      message: data.status === "active" ? "Valid key" : "Inactive key",
      data 
    });
  } catch (err) {
    res.json({ valid: false, message: "Error" });
  }
});

// Verify Admin
app.post("/admin/verify", (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

// Get All Keys
app.post("/admin/keys", async (req, res) => {
  try {
    const { adminPassword } = req.body;

    if (adminPassword !== ADMIN_PASSWORD) {
      return res.json({ success: false, error: "Wrong password" });
    }

    const { data, error } = await supabase
      .from("Sddgamer")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      return res.json({ success: false, error: error.message });
    }

    res.json({ success: true, keys: data || [] });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// Delete Key
app.post("/admin/delete-key", async (req, res) => {
  try {
    const { key, adminPassword } = req.body;

    if (adminPassword !== ADMIN_PASSWORD) {
      return res.json({ success: false, message: "Wrong password" });
    }

    if (!key) {
      return res.json({ success: false, message: "No key provided" });
    }

    const { data: existingKey, error: findError } = await supabase
      .from("Sddgamer")
      .select("*")
      .eq("key", key)
      .maybeSingle();

    if (findError) {
      return res.json({ success: false, message: findError.message });
    }

    if (!existingKey) {
      return res.json({ success: false, message: "Key not found" });
    }

    const { error: deleteError } = await supabase
      .from("Sddgamer")
      .delete()
      .eq("key", key);

    if (deleteError) {
      return res.json({ success: false, message: deleteError.message });
    }

    res.json({ success: true, message: "Key deleted successfully" });

  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

// Update Key Status
app.post("/admin/update-key", async (req, res) => {
  try {
    const { key, status, adminPassword } = req.body;

    if (adminPassword !== ADMIN_PASSWORD) {
      return res.json({ success: false, message: "Wrong password" });
    }

    if (!key) {
      return res.json({ success: false, message: "No key provided" });
    }

    const { data, error } = await supabase
      .from("Sddgamer")
      .update({ status: status })
      .eq("key", key)
      .select();

    if (error) {
      return res.json({ success: false, message: error.message });
    }

    res.json({ success: true, message: "Status updated", data });

  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port " + PORT);
});