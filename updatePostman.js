import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const collectionPath = path.join(__dirname, '3rdAI_Mobile_Auth_Postman_Collection.json');
const data = JSON.parse(fs.readFileSync(collectionPath, 'utf8'));

const mobileCaseFolder = {
    "name": "📁 Mobile - Case Management",
    "description": "APIs specific to mobile apps for dynamic form generation, case creation, and tracking.",
    "item": [
        {
            "name": "1. Get Case Types",
            "request": {
                "method": "GET",
                "header": [],
                "url": {
                    "raw": "{{base_url}}/api/mobile/cases/types",
                    "protocol": "http",
                    "host": ["localhost"],
                    "port": "4000",
                    "path": ["api", "mobile", "cases", "types"]
                },
                "description": "Returns a list of all available case types for rendering UI cards."
            }
        },
        {
            "name": "2. Get Case Form Fields",
            "request": {
                "method": "GET",
                "header": [],
                "url": {
                    "raw": "{{base_url}}/api/mobile/cases/form/snatching",
                    "protocol": "http",
                    "host": ["localhost"],
                    "port": "4000",
                    "path": ["api", "mobile", "cases", "form", "snatching"]
                },
                "description": "Returns the dynamic form layout required for a specific case category (e.g., snatching, robbery)."
            }
        },
        {
            "name": "3. Create Case",
            "request": {
                "method": "POST",
                "header": [
                    { "key": "Authorization", "value": "Bearer {{token_user}}" },
                    { "key": "Content-Type", "value": "application/json" }
                ],
                "body": {
                    "mode": "raw",
                    "raw": "{\n    \"caseType\": \"snatching\",\n    \"incidentTitle\": \"Chain snatched outside station\",\n    \"description\": \"Two men on a black bike snatched a gold chain...\",\n    \"location\": \"Andheri East Station\",\n    \"latitude\": 19.1136,\n    \"longitude\": 72.8697,\n    \"dateTime\": \"2023-10-15T08:30:00\",\n    \"snatchingType\": \"Chain\",\n    \"itemStolen\": \"20g Gold Chain\",\n    \"vehicleUsed\": \"Bike\",\n    \"numberOfAttackers\": 2,\n    \"weaponUsed\": \"No\"\n}"
                },
                "url": {
                    "raw": "{{base_url}}/api/mobile/cases/create",
                    "protocol": "http",
                    "host": ["localhost"],
                    "port": "4000",
                    "path": ["api", "mobile", "cases", "create"]
                },
                "description": "Report a new incident from the mobile app."
            }
        },
        {
            "name": "4. Upload Case Media",
            "request": {
                "method": "POST",
                "header": [
                    { "key": "Authorization", "value": "Bearer {{token_user}}" }
                ],
                "body": {
                    "mode": "formdata",
                    "formdata": [
                        { "key": "caseId", "value": "{{caseId}}", "type": "text" },
                        { "key": "media", "type": "file", "src": [] }
                    ]
                },
                "url": {
                    "raw": "{{base_url}}/api/mobile/cases/upload-media",
                    "protocol": "http",
                    "host": ["localhost"],
                    "port": "4000",
                    "path": ["api", "mobile", "cases", "upload-media"]
                },
                "description": "Upload photos/videos for a specific case."
            }
        },
        {
            "name": "5. Get My Cases",
            "request": {
                "method": "GET",
                "header": [
                    { "key": "Authorization", "value": "Bearer {{token_user}}" }
                ],
                "url": {
                    "raw": "{{base_url}}/api/mobile/cases/my",
                    "protocol": "http",
                    "host": ["localhost"],
                    "port": "4000",
                    "path": ["api", "mobile", "cases", "my"]
                },
                "description": "Retrieve a list of cases reported by the authenticated user."
            }
        },
        {
            "name": "6. Get Case Details",
            "request": {
                "method": "GET",
                "header": [
                    { "key": "Authorization", "value": "Bearer {{token_user}}" }
                ],
                "url": {
                    "raw": "{{base_url}}/api/mobile/cases/{{caseId}}",
                    "protocol": "http",
                    "host": ["localhost"],
                    "port": "4000",
                    "path": ["api", "mobile", "cases", "{{caseId}}"]
                },
                "description": "Fetch all details and metadata for a specific user case."
            }
        },
        {
            "name": "7. Get Case Timeline",
            "request": {
                "method": "GET",
                "header": [
                    { "key": "Authorization", "value": "Bearer {{token_user}}" }
                ],
                "url": {
                    "raw": "{{base_url}}/api/mobile/cases/{{caseId}}/timeline",
                    "protocol": "http",
                    "host": ["localhost"],
                    "port": "4000",
                    "path": ["api", "mobile", "cases", "{{caseId}}", "timeline"]
                },
                "description": "Retrieve the step-by-step progress tracking timeline."
            }
        }
    ]
};

// Check if already injected
// Note: We use a fuzzy match to handle emoji variations or name shifts
const mobileFolderIndex = data.item.findIndex(i => i.name && i.name.includes('Mobile - Case Management'));
if (mobileFolderIndex !== -1) {
    // Update existing folder
    data.item[mobileFolderIndex] = mobileCaseFolder;
    console.log('Updated existing 📁 Mobile - Case Management folder.');
} else {
    // Inject new folder
    const healthIndex = data.item.findIndex(i => i.name && i.name.includes('Health'));
    if (healthIndex !== -1) {
        data.item.splice(healthIndex, 0, mobileCaseFolder);
    } else {
        data.item.push(mobileCaseFolder);
    }
    console.log('Injected new 📁 Mobile - Case Management folder.');
}

// ── CUSTOM UPDATE: Rename Public Client API ──
const publicFolder = data.item.find(i => i.name && i.name.includes('Public APIs'));
if (publicFolder && publicFolder.item) {
    const clientApi = publicFolder.item.find(i => i.name && i.name.includes('Organizations (Clients)'));
    if (clientApi) {
        clientApi.name = "clients list api";
        // Update URL to include the code
        if (clientApi.request && clientApi.request.url) {
            clientApi.request.url.raw = "{{base_url}}/api/public/clients/778205";
            clientApi.request.url.path = ["api", "public", "clients", "778205"];
        }
        console.log('Renamed Public Organizations API to "clients list api" and updated URL.');
    }
}

if (!data.variable.some(v => v.key === 'caseId')) {
    data.variable.push({
        "key": "caseId",
        "value": "",
        "description": "Dynamic case ID for timeline, details, and media upload."
    });
}

fs.writeFileSync(collectionPath, JSON.stringify(data, null, 4));
console.log('Successfully completed Postman API update.');
