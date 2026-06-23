const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

// 1. Build Menu
const MENU_DIR = path.join(__dirname, 'content', 'menu');
const MENU_OUTPUT = path.join(__dirname, 'menu.json');

function buildJson(sourceDir, outputFile, schemaMap) {
    if (!fs.existsSync(sourceDir)) {
        fs.mkdirSync(sourceDir, { recursive: true });
        return {};
    }

    const items = {};
    const files = fs.readdirSync(sourceDir);

    files.forEach(file => {
        if (!file.endsWith('.md')) return;

        const filePath = path.join(sourceDir, file);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const { data } = matter(fileContent);
        const id = file.replace('.md', '');

        if (data.available !== false && data.active !== false) {
            items[id] = schemaMap(id, data);
        }
    });

    fs.writeFileSync(outputFile, JSON.stringify(items, null, 2));
    console.log(`Generated ${path.basename(outputFile)} with ${Object.keys(items).length} items.`);
    return items;
}

buildJson(MENU_DIR, MENU_OUTPUT, (id, data) => ({
    id: id,
    name: data.title,
    price: data.price,
    category: data.category,
    description: data.description || '',
    image: data.image || '',
    available: data.available,
    variants: data.variants || []
}));

// 2. Build Offers
const OFFERS_DIR = path.join(__dirname, 'content', 'offers');
const OFFERS_OUTPUT = path.join(__dirname, 'offers.json');

buildJson(OFFERS_DIR, OFFERS_OUTPUT, (id, data) => ({
    id: id,
    title: data.title,
    description: data.description,
    price: data.price || 0,
    tag: data.tag,
    image: data.image,
    active: data.active
}));

// 3. Generate Backend config.json for Serverless Functions
if (process.env.NETLIFY !== 'true') {
    try {
        const configPath = path.join(__dirname, 'js', 'firebase-config.js');
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf8');
            
            // Match the firebaseConfig object declaration
            const configBlockMatch = content.match(/const\s+firebaseConfig\s*=\s*\{([\s\S]*?)\};/);
            if (configBlockMatch) {
                const blockContent = configBlockMatch[1];
                const config = {};
                
                // Extract required properties using regex
                const fields = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
                fields.forEach(field => {
                    const regex = new RegExp(`${field}:\\s*["']([^"']+)["']`);
                    const match = blockContent.match(regex);
                    if (match && match[1]) {
                        config[field] = match[1];
                    }
                });
                
                const functionsDir = path.join(__dirname, 'netlify', 'functions');
                if (!fs.existsSync(functionsDir)) {
                    fs.mkdirSync(functionsDir, { recursive: true });
                }
                
                const functionsConfigPath = path.join(functionsDir, 'config.json');
                fs.writeFileSync(functionsConfigPath, JSON.stringify(config, null, 2));
                console.log(`Generated netlify/functions/config.json for serverless context.`);
            }
        }
    } catch (err) {
        console.error("Failed to build config for serverless functions:", err);
    }
}

console.log(`Build complete!`);
