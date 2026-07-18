import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize AWS Client
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "us-west-1",
  credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ""
  }
});
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.DYNAMO_TABLE_NAME;
if (!TABLE_NAME) {
    console.error('DYNAMO_TABLE_NAME env var is required (e.g. DYNAMO_TABLE_NAME=SFUGuessrLocations node scripts/seedDynamoDB.js)');
    process.exit(1);
}

const LOCATIONS_FILE = process.env.LOCATIONS_FILE || 'locations.ubc.json';
const locationsPath = path.join(__dirname, '../src/data', LOCATIONS_FILE);
const locationsToMigrate = JSON.parse(fs.readFileSync(locationsPath, 'utf8'))
    .filter((loc) => Array.isArray(loc.coordinates))
    .map((loc) => ({ id: loc.id, lat: loc.coordinates[0], lng: loc.coordinates[1], label: loc.label ?? '' }));

console.log(`Found ${locationsToMigrate.length} locations to migrate. Starting upload...`);

async function migrate() {
    let successCount = 0;
    
    for (const loc of locationsToMigrate) {
        const command = new PutCommand({
            TableName: TABLE_NAME,
            Item: {
                id: loc.id,
                coordinates: [loc.lat, loc.lng],
                label: loc.label,
                createdAt: new Date().toISOString()
            }
        });
        
        try {
            await docClient.send(command);
            successCount++;
            process.stdout.write('.');
        } catch (error) {
            console.error(`\nFailed to upload ${loc.id}:`, error.message);
        }
    }
    
    console.log(`\n\nMigration complete. Successfully uploaded ${successCount}/${locationsToMigrate.length} locations to DynamoDB.`);
}

migrate();
