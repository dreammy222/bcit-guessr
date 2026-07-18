import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, DeleteCommand } from "@aws-sdk/lib-dynamodb";
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' });

const cleanKey = (val) => val ? val.replace(/^"|"$/g, '') : '';

const client = new DynamoDBClient({
  region: cleanKey(process.env.AWS_REGION) || "us-west-1",
  credentials: {
      accessKeyId: cleanKey(process.env.AWS_ACCESS_KEY_ID) || "",
      secretAccessKey: cleanKey(process.env.AWS_SECRET_ACCESS_KEY) || ""
  }
});
const docClient = DynamoDBDocumentClient.from(client);

async function clearTable() {
    console.log("Scanning table for items to delete...");
    
    try {
        const scanCommand = new ScanCommand({
            TableName: "UBCGuessrLocations",
            ProjectionExpression: "id"
        });
        
        const response = await docClient.send(scanCommand);
        const items = response.Items || [];
        
        if (items.length === 0) {
            console.log("Table is already empty.");
            return;
        }
        
        console.log(`Found ${items.length} items. Deleting...`);
        
        let deletedCount = 0;
        for (const item of items) {
            const deleteCommand = new DeleteCommand({
                TableName: "UBCGuessrLocations",
                Key: { id: item.id }
            });
            await docClient.send(deleteCommand);
            deletedCount++;
            process.stdout.write('.');
        }
        
        console.log(`\n\nSuccessfully deleted ${deletedCount} items.`);
    } catch (error) {
        console.error("Failed to clear table:", error.message);
    }
}

clearTable();
