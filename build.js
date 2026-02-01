const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

const CONTENT_DIR = path.join(__dirname, 'content', 'menu');
const OUTPUT_FILE = path.join(__dirname, 'menu.json');

// Ensure content directory exists (for first run or if empty)
if (!fs.existsSync(CONTENT_DIR)) {
    console.log('Content directory not found, creating it...');
    fs.mkdirSync(CONTENT_DIR, { recursive: true });
}

const menuItems = {};

console.log(`Starting build from: ${CONTENT_DIR}`);
const files = fs.readdirSync(CONTENT_DIR);

files.forEach(file => {
    if (!file.endsWith('.md')) return;

    const filePath = path.join(CONTENT_DIR, file);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const { data } = matter(fileContent);

    // Use filename as ID if not present
    const id = file.replace('.md', '');

    if (data.available !== false) {
        menuItems[id] = {
            id: id,
            name: data.title,
            price: data.price,
            category: data.category,
            description: data.description || '',
            image: data.image || '',
            available: data.available
        };
    }
});

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(menuItems, null, 2));
console.log(`Build complete! Generated menu.json with ${Object.keys(menuItems).length} items.`);
