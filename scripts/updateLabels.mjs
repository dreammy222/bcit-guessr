import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' });

// Initialize AWS Client
const cleanKey = (val) => val ? val.replace(/^"|"$/g, '') : '';

const client = new DynamoDBClient({
  region: cleanKey(process.env.AWS_REGION) || "us-west-1",
  credentials: {
      accessKeyId: cleanKey(process.env.AWS_ACCESS_KEY_ID) || "",
      secretAccessKey: cleanKey(process.env.AWS_SECRET_ACCESS_KEY) || ""
  }
});
const docClient = DynamoDBDocumentClient.from(client);

const data = [
  { id: "GS__0210", lat: 49.264486, lng: -123.24409, label: "Near UBC Hositpal" },
  { id: "GS__0211", lat: 49.264869, lng: -123.245572, label: "Behind IRC" },
  { id: "GS__0212", lat: 49.264405, lng: -123.246967, label: "Behind IRC" },
  { id: "GS__0213", lat: 49.262995, lng: -123.246814, label: "UBC Health Science parkade" },
  { id: "GS__0214", lat: 49.265018, lng: -123.246117, label: "Next to IRC" },
  { id: "GS__0215", lat: 49.263655, lng: -123.245869, label: "Between UBC Hospital" },
  { id: "GS__0216", lat: 49.261873, lng: -123.24566, label: "UBC Life Science Centre" },
  { id: "GS__0217", lat: 49.263661, lng: -123.249263, label: "Behind Beaty" },
  { id: "GS__0218", lat: 49.263428, lng: -123.251463, label: "In front of Beaty" },
  { id: "GS__0219", lat: 49.264537, lng: -123.252419, label: "In front of Biology Building" },
  { id: "GS__0220", lat: 49.265582, lng: -123.253193, label: "In front of Sauder" },
  { id: "GS__0221", lat: 49.266097, lng: -123.253603, label: "In front of Sauder" },
  { id: "GS__0222", lat: 49.266546, lng: -123.252959, label: "Hennings" },
  { id: "GS__0223", lat: 49.267056, lng: -123.251572, label: "Near Walter Gage" },
  { id: "GS__0224", lat: 49.268032, lng: -123.249539, label: "Near SRC" },
  { id: "GS__0226", lat: 49.268417, lng: -123.250998, label: "JACS Vancouver" },
  { id: "GS__0227", lat: 49.269105, lng: -123.250167, label: "Near Walter Gage" },
  { id: "GS__0228", lat: 49.269888, lng: -123.249616, label: "Walter Gage" },
  { id: "GS__0229", lat: 49.270034, lng: -123.248297, label: "Walter Gage" },
  { id: "GS__0230", lat: 49.269914, lng: -123.250724, label: "Walter Gage Road" },
  { id: "GS__0231", lat: 49.270774, lng: -123.250373, label: "Iona Park" },
  { id: "GS__0232", lat: 49.271198, lng: -123.251221, label: "Iona Park" },
  { id: "GS__0233", lat: 49.271295, lng: -123.252341, label: "Chapel of Epiphany" },
  { id: "GS__0234", lat: 49.271015, lng: -123.253344, label: "Chapel of Epiphany" },
  { id: "GS__0235", lat: 49.270276, lng: -123.252862, label: "Allard Law School" },
  { id: "GS__0236", lat: 49.270604, lng: -123.252814, label: "Allard Law School" },
  { id: "GS__0237", lat: 49.269076, lng: -123.253158, label: "Allard Law School" },
  { id: "GS__0238", lat: 49.269645, lng: -123.256098, label: "UBC Chan Centre" },
  { id: "GS__0239", lat: 49.269309, lng: -123.256432, label: "Rose garden" },
  { id: "GS__0240", lat: 49.269040, lng: -123.256569, label: "Rose Garden" },
  { id: "GS__0241", lat: 49.269202, lng: -123.257138, label: "Koerner" },
  { id: "GS__0242", lat: 49.268844, lng: -123.257967, label: "Koerner" },
  { id: "GS__0243", lat: 49.268188, lng: -123.25758, label: "Koerner" },
  { id: "GS__0244", lat: 49.268034, lng: -123.257923, label: "Koerner" },
  { id: "GS__0245", lat: 49.266979, lng: -123.257496, label: "Asian Centre" },
  { id: "GS__0246", lat: 49.266792, lng: -123.257404, label: "Tagore Statue" },
  { id: "GS__0247", lat: 49.266642, lng: -123.258268, label: "Asian Centre" },
  { id: "GS__0248", lat: 49.26626, lng: -123.258853, label: "Nitobe Gardens" },
  { id: "GS__0249", lat: 49.265406, lng: -123.257999, label: "Place Vanier" },
  { id: "GS__0250", lat: 49.264546, lng: -123.258935, label: "Place Vanier" },
  { id: "GS__0251", lat: 49.264205, lng: -123.258312, label: "Place Vanier" },
  { id: "GS__0252", lat: 49.263855, lng: -123.258024, label: "Place Vanier" },
  { id: "GS__0253", lat: 49.263642, lng: -123.256872, label: "Place Vanier" },
  { id: "GS__0254", lat: 49.26341, lng: -123.256268, label: "Ponderosa" },
  { id: "GS__0255", lat: 49.262904, lng: -123.25652, label: "St Johns College" },
  { id: "GS__0256", lat: 49.262513, lng: -123.255634, label: "West Parkade" },
  { id: "GS__0257", lat: 49.262012, lng: -123.255192, label: "Marine Drive" },
  { id: "GS__0258", lat: 49.261838, lng: -123.255644, label: "Marine Drive" },
  { id: "GS__0260", lat: 49.261001, lng: -123.254408, label: "Marine Drive" },
  { id: "GS__0262", lat: 49.259527, lng: -123.253219, label: "Totem Park" },
  { id: "GS__0263", lat: 49.258637, lng: -123.252162, label: "Totem Park" },
  { id: "GS__0265", lat: 49.259126, lng: -123.252537, label: "Totem Park" },
  { id: "GS__0267", lat: 49.258527, lng: -123.250658, label: "Totem Park" },
  { id: "GS__0268", lat: 49.258592, lng: -123.2505, label: "Thunderbird Blvd" },
  { id: "GS__0269", lat: 49.258833, lng: -123.249621, label: "Thunderbird Blvd" },
  { id: "GS__0270", lat: 49.25913, lng: -123.248743, label: "Larkin Drive" },
  { id: "GS__0271", lat: 49.259205, lng: -123.248843, label: "Forestry Building" },
  { id: "GS__0272", lat: 49.259993, lng: -123.248705, label: "Reconciliation Pole" },
  { id: "GS__0273", lat: 49.260594, lng: -123.24912, label: "Forestry Building" },
  { id: "GS__0274", lat: 49.26099, lng: -123.248099, label: "Agronomy Rd" },
  { id: "GS__0276", lat: 49.261004, lng: -123.248056, label: "Hugh Dempster Pavilion" },
  { id: "GS__0279", lat: 49.261937, lng: -123.245353, label: "Life Science Centre" },
  { id: "GS__0280", lat: 49.261793, lng: -123.244329, label: "Life Science Centre" },
  { id: "GS__0281", lat: 49.261643, lng: -123.244261, label: "Life Science Centre" },
  { id: "GS__0282", lat: 49.262612, lng: -123.243598, label: "Pharmaceutical Sciences Building" },
  { id: "GS__0283", lat: 49.263065, lng: -123.242602, label: "Pharmaceutical Sciences Building" },
  { id: "GS__0284", lat: 49.263622, lng: -123.243085, label: "Wesbrook Mall" }
];

async function updateLabels() {
    let successCount = 0;
    const now = new Date().toISOString();
    console.log(`Starting fresh upload for ${data.length} locations...`);

    for (const loc of data) {
        const command = new PutCommand({
            TableName: "UBCGuessrLocations",
            Item: {
                id: loc.id,
                label: loc.label,
                coordinates: [loc.lat, loc.lng],
                updatedAt: now,
                createdAt: now // Since we are re-uploading fresh
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

    console.log(`\n\nUpload complete. Successfully uploaded ${successCount}/${data.length} locations.`);
}

updateLabels();
