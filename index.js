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

// ✅ Admin Password
const ADMIN_PASSWORD = "SDD213";

// ========== AUTO CLEANUP EXPIRED KEYS ==========
async function deleteExpiredKeys() {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    
    console.log(`🧹 Checking for expired keys (before ${today})...`);
    
    const { data: expiredKeys, error: findError } = await supabase
      .from("Sddgamer")
      .select("*")
      .lt("expiry", today)
      .neq("expiry", "9999-12-31"); // Skip permanent keys

    if (findError) {
      console.error("Error finding expired keys:", findError);
      return;
    }

    if (expiredKeys && expiredKeys.length > 0) {
      console.log(`🗑️ Found ${expiredKeys.length} expired keys to delete`);
      
      for (const key of expiredKeys) {
        const { error: deleteError } = await supabase
          .from("Sddgamer")
          .delete()
          .eq("key", key.key);
        
        if (deleteError) {
          console.error(`Failed to delete ${key.key}:`, deleteError);
        } else {
          console.log(`✅ Deleted expired key: ${key.key} (expired on ${key.expiry})`);
        }
      }
    } else {
      console.log("✅ No expired keys found");
    }
  } catch (err) {
    console.error("Auto cleanup error:", err);
  }
}

// Run auto-cleanup every 1 hour
setInterval(deleteExpiredKeys, 60 * 60 * 1000); // 1 hour

// Run immediately on startup
deleteExpiredKeys();

// ========== API ENDPOINTS ==========

app.get("/", (req, res) => {
  res.send("Server Running ✅");
});

// ========== GENERATE KEY ==========
app.post("/generate", async (req, res) => {
  try {
    const { key, expiry, adminPassword } = req.body;

    if (adminPassword !== ADMIN_PASSWORD) {
      return res.json({ success: false, error: "Wrong password" });
    }

    const { data, error } = await supabase
      .from("Sddgamer")
      .insert([{ 
        key: key, 
        expiry: expiry || "9999-12-31",
        status: "active",
        created_at: new Date().toISOString()
      }])
      .select();

    if (error) {
      return res.json({ success: false, error: error.message });
    }

    res.json({ success: true, key: key, data });
  } catch (err) {
    res.json({ success: false, error: err.message });
  }
});

// ========== CHECK KEY ==========
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

    // Check if key is expired
    const today = new Date().toISOString().split('T')[0];
    if (data.expiry && data.expiry !== "9999-12-31" && data.expiry < today) {
      return res.json({ 
        valid: false, 
        message: "Key expired",
        data: data 
      });
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

// ========== VERIFY ADMIN ==========
app.post("/admin/verify", (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true });
  } else {
    res.json({ success: false });
  }
});

// ========== GET ALL KEYS (WITH AUTO CLEANUP) ==========
app.post("/admin/keys", async (req, res) => {
  try {
    const { adminPassword } = req.body;

    if (adminPassword !== ADMIN_PASSWORD) {
      return res.json({ success: false, error: "Wrong password" });
    }

    // First, delete expired keys
    await deleteExpiredKeys();

    // Then fetch remaining keys
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

// ========== DELETE KEY ==========
app.post("/admin/delete-key", async (req, res) => {
  try {
    const { key, adminPassword } = req.body;

    console.log("Delete request received:", { key, adminPassword });

    if (adminPassword !== ADMIN_PASSWORD) {
      return res.status(401).json({ success: false, message: "Wrong password" });
    }

    if (!key || key.trim() === "") {
      return res.status(400).json({ success: false, message: "No key provided" });
    }

    const cleanKey = key.trim();

    const { data: existingKey, error: findError } = await supabase
      .from("Sddgamer")
      .select("*")
      .eq("key", cleanKey)
      .maybeSingle();

    if (findError) {
      console.error("Find error:", findError);
      return res.status(500).json({ success: false, message: findError.message });
    }

    if (!existingKey) {
      return res.status(404).json({ success: false, message: "Key not found" });
    }

    const { error: deleteError } = await supabase
      .from("Sddgamer")
      .delete()
      .eq("key", cleanKey);

    if (deleteError) {
      console.error("Delete error:", deleteError);
      return res.status(500).json({ success: false, message: deleteError.message });
    }

    res.json({ 
      success: true, 
      message: "Key deleted successfully",
      deletedKey: cleanKey 
    });

  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========== UPDATE KEY STATUS ==========
app.post("/admin/update-key", async (req, res) => {
  try {
    const { key, status, adminPassword } = req.body;

    console.log("Update request received:", { key, status, adminPassword });

    if (adminPassword !== ADMIN_PASSWORD) {
      return res.status(401).json({ success: false, message: "Wrong password" });
    }

    if (!key || key.trim() === "") {
      return res.status(400).json({ success: false, message: "No key provided" });
    }

    const cleanKey = key.trim();

    const { data, error } = await supabase
      .from("Sddgamer")
      .update({ status: status })
      .eq("key", cleanKey)
      .select();

    if (error) {
      console.error("Update error:", error);
      return res.status(500).json({ success: false, message: error.message });
    }

    if (!data || data.length === 0) {
      return res.status(404).json({ success: false, message: "Key not found" });
    }

    res.json({ 
      success: true, 
      message: "Status updated",
      data: data[0] 
    });

  } catch (err) {
    console.error("Server error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ========== MANUAL CLEANUP ENDPOINT ==========
app.post("/admin/cleanup", async (req, res) => {
  try {
    const { adminPassword } = req.body;
    
    if (adminPassword !== ADMIN_PASSWORD) {
      return res.status(401).json({ success: false, message: "Wrong password" });
    }
    
    await deleteExpiredKeys();
    res.json({ success: true, message: "Cleanup completed" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
  console.log("🧹 Auto-cleanup will run every hour");
});