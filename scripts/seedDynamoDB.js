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

// Parse locations directly from file to avoid TS import issues
const locationsPath = path.join(__dirname, '../src/data/locations.ts');
const fileContent = fs.readFileSync(locationsPath, 'utf8');

const regex = /{ id: '([^']+)', filename: '([^']+)', coordinates: \[([\d.-]+), ([\d.-]+)\], label: '([^']+)' }/g;
let match;
const locationsToMigrate = [];

while ((match = regex.exec(fileContent)) !== null) {
    locationsToMigrate.push({
        id: match[1],
        lat: parseFloat(match[3]),
        lng: parseFloat(match[4]),
        label: match[5]
    });
}

console.log(`Found ${locationsToMigrate.length} locations to migrate. Starting upload...`);

async function migrate() {
    let successCount = 0;
    
    for (const loc of locationsToMigrate) {
        const command = new PutCommand({
            TableName: "UBCGuessrLocations",
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
