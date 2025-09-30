const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const cameraInput = document.getElementById('cameraInput');
const previewSection = document.getElementById('previewSection');
const previewImage = document.getElementById('previewImage');
const loading = document.getElementById('loading');
const resultsSection = document.getElementById('resultsSection');
const resultsGrid = document.getElementById('resultsGrid');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const errorMessage = document.getElementById('errorMessage');

let currentFile = null;

// Drag and drop functionality
uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

cameraInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        showError('Please upload an image file');
        return;
    }

    currentFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        previewImage.src = e.target.result;
        previewSection.style.display = 'block';
        resultsSection.style.display = 'none';
        errorMessage.style.display = 'none';
    };
    reader.readAsDataURL(file);
}

async function analyzeImage() {
    if (!currentFile) return;

    loading.style.display = 'block';
    previewSection.style.display = 'none';
    resultsSection.style.display = 'none';
    errorMessage.style.display = 'none';

    try {
        // Step 1: Upload to ImgBB
        progressBar.style.width = '30%';
        progressText.textContent = 'Uploading image...';

        const imageUrl = await uploadToImgBB(currentFile);

        // Step 2: Analyze with Groq
        progressBar.style.width = '60%';
        progressText.textContent = 'Analyzing food...';

        const nutritionData = await analyzeWithGroq(imageUrl);

        // Step 3: Display results
        progressBar.style.width = '100%';
        progressText.textContent = 'Complete!';

        setTimeout(() => {
            displayResults(nutritionData);
            // Show the image in results section
            const resultImage = document.getElementById('resultImage');
            resultImage.src = previewImage.src;
            resultImage.style.display = 'block';
            
            loading.style.display = 'none';
            resultsSection.style.display = 'block';
        }, 500);

    } catch (error) {
        console.error('Error:', error);
        loading.style.display = 'none';
        showError(error.message || 'An error occurred while analyzing the image. Please try again.');
        progressBar.style.width = '0%';
    }
}

async function uploadToImgBB(file) {
    const formData = new FormData();
    
    // Convert file to base64
    const base64 = await fileToBase64(file);
    formData.append('image', base64.split(',')[1]);

    const response = await fetch(`https://api.imgbb.com/1/upload?key=${API_CONFIG.IMGBB_API_KEY}`, {
        method: 'POST',
        body: formData
    });

    if (!response.ok) {
        const errorData = await response.text();
        console.error('ImgBB Error:', errorData);
        throw new Error('Failed to upload image to ImgBB');
    }

    const data = await response.json();
    console.log('ImgBB Response:', data);
    return data.data.url;
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

async function analyzeWithGroq(imageUrl) {
    console.log('Analyzing image URL:', imageUrl);
    
    const requestBody = {
        messages: [
            {
                role: "user",
                content: [
                    {
                        type: "text",
                        text: "Analyze this food image and provide nutritional information for each item. Return ONLY valid JSON in this exact format: {\"items\":[{\"item_name\":\"name\",\"total_calories\":150,\"total_protien\":10,\"toal_carbs\":20,\"toal_fats\":5}]}"
                    },
                    {
                        type: "image_url",
                        image_url: {
                            url: imageUrl
                        }
                    }
                ]
            }
        ],
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        temperature: 0.7,
        max_completion_tokens: 2048,
        top_p: 1,
        stream: false,
        response_format: {
            type: "json_object"
        }
    };

    console.log('Groq Request:', JSON.stringify(requestBody, null, 2));

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_CONFIG.GROQ_API_KEY}`
        },
        body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();
    console.log('Groq Raw Response:', responseText);

    if (!response.ok) {
        console.error('Groq Error Status:', response.status);
        console.error('Groq Error:', responseText);
        throw new Error(`Groq API Error (${response.status}): ${responseText.substring(0, 200)}`);
    }

    const data = JSON.parse(responseText);
    console.log('Groq Parsed Response:', data);
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
        throw new Error('Invalid response format from Groq');
    }

    const content = data.choices[0].message.content;
    console.log('Content to parse:', content);
    
    const parsedContent = JSON.parse(content);
    return parsedContent;
}

function displayResults(data) {
    if (!data.items || data.items.length === 0) {
        showError('No food items detected in the image');
        return;
    }

    resultsGrid.innerHTML = data.items.map((item, index) => {
        console.log('Item data:', item);
        
        // Handle different possible field names and ensure numeric values
        const calories = parseFloat(item.total_calories || item.calories || 0);
        const protein = parseFloat(item.total_protien || item.total_protein || item.protein || 0);
        const carbs = parseFloat(item.toal_carbs || item.total_carbs || item.carbs || 0);
        const fats = parseFloat(item.toal_fats || item.total_fats || item.fats || 0);

        console.log('Parsed values:', { calories, protein, carbs, fats });

        // Calculate percentages for circular progress (based on typical daily values)
        const caloriePercent = Math.min((calories / 2000) * 100, 100);
        const proteinPercent = Math.min((protein / 50) * 100, 100);
        const carbsPercent = Math.min((carbs / 300) * 100, 100);
        const fatsPercent = Math.min((fats / 70) * 100, 100);

        const nutrients = [
            { icon: '🔥', label: 'Calories', value: calories, unit: 'kcal', percent: caloriePercent, color: '#FF6B6B' },
            { icon: '🥩', label: 'Protein', value: protein, unit: 'g', percent: proteinPercent, color: '#4ECDC4' },
            { icon: '🍞', label: 'Carbs', value: carbs, unit: 'g', percent: carbsPercent, color: '#FFE66D' },
            { icon: '🥑', label: 'Fat', value: fats, unit: 'g', percent: fatsPercent, color: '#95E1D3' }
        ];

        return `
            <div class="result-card">
                <div class="card-header">
                    <div class="card-icon">🍽️</div>
                    <div class="card-title-section">
                        <div class="card-title">${item.item_name || 'Unknown Item'}</div>
                        <div class="card-subtitle">Nutritional Breakdown</div>
                    </div>
                </div>
                ${nutrients.map(n => `
                    <div class="nutrient-row">
                        <div class="nutrient-info">
                            <span class="nutrient-icon">${n.icon}</span>
                            <div>
                                <div class="nutrient-label">${n.label}</div>
                                <div class="nutrient-value">${n.value.toFixed(1)} ${n.unit}</div>
                            </div>
                        </div>
                        <div class="circular-progress">
                            <svg width="80" height="80">
                                <circle class="circular-progress-bg" cx="40" cy="40" r="32"></circle>
                                <circle class="circular-progress-bar" cx="40" cy="40" r="32"
                                    stroke="${n.color}"
                                    stroke-dasharray="201"
                                    stroke-dashoffset="${201 - (201 * n.percent / 100)}"
                                ></circle>
                            </svg>
                            <div class="progress-text">${Math.round(n.percent)}%</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }).join('');
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}