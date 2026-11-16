# LN Wardrobe

Catalogue website (no cart / checkout / payment / order storage). Customers pick colour + size and the
"Order on WhatsApp" button opens WhatsApp with the details pre-filled.

## Run
1. Install Node.js 18+ (https://nodejs.org, LTS)
2. In this folder: `node server.js`
3. Shop: http://localhost:3000   Admin: http://localhost:3000/admin

First login: `admin` / `admin123` -> go to Settings, set the WhatsApp number and change the password.

Data lives in `data/` (products.json, config.json) and photos in `uploads/` — back these up.
