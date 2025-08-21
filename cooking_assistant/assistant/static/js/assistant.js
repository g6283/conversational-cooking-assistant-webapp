class CookingAssistant {
    constructor() {
        this.assistantContainer = document.getElementById('assistantContainer');
        this.messagesContainer = document.getElementById('assistantMessages');
        this.micButton = document.getElementById('toggleMode');
        this.textInput = document.getElementById('textInput');

        this.typingIndicatorTemplate = document.getElementById('typingIndicatorTemplate');
        this.recipeCardTemplate = document.getElementById('recipeCardTemplate');
        this.recipeDetailTemplate = document.getElementById('recipeDetailTemplate');

        this.recognition = null;
        this.isVoiceMode = false;
        this.isWaitingForFollowUp = false;
        this.currentRecipes = [];
        this.currentRecipe = null;
        this.isProcessing = false;
        this.typingIndicator = null;
        this.speechSupported = false;
        this.isListening = false;

        this.initSpeechRecognition();
        this.setupEventListeners();
        this.showWelcomeMessage();

        setTimeout(() => this.assistantContainer.classList.add('open'), 100);
    }

    initSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.speechSupported = !!SpeechRecognition;
        
        if (!this.speechSupported) {
            console.warn("Speech recognition not supported in this browser");
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.lang = 'en-US';
        this.recognition.interimResults = false;
        this.recognition.maxAlternatives = 1;
        this.recognition.continuous = false;

        this.recognition.onresult = (event) => this.handleRecognitionResult(event);
        this.recognition.onerror = (event) => this.handleRecognitionError(event);
        this.recognition.onend = () => this.handleRecognitionEnd();
        this.recognition.onnomatch = () => this.handleNoMatch();
    }

    setupEventListeners() {
        this.micButton.addEventListener('click', () => this.toggleVoiceMode());

        this.textInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && this.textInput.value.trim() && !this.isProcessing) {
                this.handleUserInput(this.textInput.value.trim());
                this.textInput.value = '';
            }
        });

        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('mod-button') && !this.isProcessing) {
                this.handleModificationRequest(e.target.dataset.mod);
            }
        });

        // Improved recipe card click handling with data-index
        this.messagesContainer.addEventListener('click', (e) => {
            const card = e.target.closest('.recipe-card');
            if (card && !this.isProcessing) {
                const index = parseInt(card.dataset.index);
                if (!isNaN(index)) {
                    const recipe = this.currentRecipes[index];
                    if (recipe) {
                        this.showRecipeDetails(recipe);
                    }
                }
            }
        });
    }

    toggleVoiceMode() {
        if (this.isProcessing) return;

        this.isVoiceMode = !this.isVoiceMode;
        if (this.isVoiceMode) {
            if (!this.speechSupported) {
                this.addMessage("Speech recognition not supported in your browser", false);
                this.isVoiceMode = false;
                return;
            }
            this.startListening();
            this.textInput.placeholder = "Listening... Say your request";
        } else {
            this.stopListening();
            this.textInput.placeholder = "Type your request...";
        }
        this.micButton.classList.toggle('active', this.isVoiceMode);
    }

    showWelcomeMessage() {
        const welcomeMessages = [
            "👋 Hi there! I'm ChefMate, your cooking assistant. What would you like to cook today?",
            "🍳 Hello! I can help you find recipes based on your dietary needs. What ingredients do you have?",
        ];

        const randomWelcome = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
        this.addMessage(randomWelcome, false);

        setTimeout(() => {
            this.showQuickReplies([
                "Vegetarian options",
                "Healthy dinner ideas",
                "Quick low-carb meals"
            ]);
        }, 1500);
    }

    startListening() {
        if (!this.speechSupported || !this.recognition) {
            this.addMessage("Speech recognition not available", false);
            return;
        }
        if (this.isProcessing || this.isListening) return;

        this.isListening = true;
        this.micButton.classList.add('listening');
        this.addMessage("(Listening...)", false);

        try {
            this.recognition.start();
        } catch (e) {
            console.error("Speech recognition start error:", e);
            this.isListening = false;
            this.micButton.classList.remove('listening');
            this.addMessage("Couldn't start listening. Please try again.", false);
        }
    }

    stopListening() {
        if (!this.recognition) return;
        
        this.isListening = false;
        this.micButton.classList.remove('listening');
        
        try {
            this.recognition.stop();
        } catch (e) {
            console.warn("Error stopping recognition:", e);
        }
    }

    handleRecognitionResult(event) {
        this.isListening = false;
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
                transcript += event.results[i][0].transcript.trim() + ' ';
            }
        }
        transcript = transcript.trim();
        if (!transcript) return;

        this.addMessage(transcript, true);

        if (this.isWaitingForFollowUp) {
            this.handleFollowUp(transcript);
        } else {
            this.handleUserInput(transcript);
        }
    }

    handleRecognitionError(event) {
        this.isListening = false;
        this.micButton.classList.remove('listening');
        
        const errorMap = {
            'no-speech': 'No speech detected',
            'audio-capture': 'Microphone not available',
            'not-allowed': 'Microphone access denied',
            'aborted': 'Speech input aborted',
            'network': 'Network communication failed'
        };

        const errorMessage = errorMap[event.error] || `Error: ${event.error}`;
        this.addMessage(`(Error: ${errorMessage})`, false);
    }

    handleRecognitionEnd() {
        this.isListening = false;
        
        if (this.isVoiceMode && !this.isProcessing) {
            // Visual feedback that we're restarting
            this.micButton.classList.add('restarting');
            
            setTimeout(() => {
                try {
                    if (this.recognition) {
                        this.recognition.abort(); // Clean up any existing session
                        this.startListening();
                    }
                } catch (err) {
                    console.warn("Restart failed:", err);
                    this.micButton.classList.remove('listening', 'restarting');
                } finally {
                    this.micButton.classList.remove('restarting');
                }
            }, 800); // Slightly longer cooldown
        } else {
            this.micButton.classList.remove('listening');
        }
    }

    handleNoMatch() {
        setTimeout(() => {
            this.addMessage("I didn't catch that. Please try again.", false);
        }, 500);
    }

    handleUserInput(text) {
        if (this.isProcessing) return;

        const resetCommands = ["reset", "start over", "clear session", "new session", "begin again"];
        if (resetCommands.some(cmd => text.toLowerCase().includes(cmd))) {
            this.resetSession();
            return;
        }

        this.isWaitingForFollowUp = false;
        this.addMessage(text, true);
        this.showTypingIndicator();
        this.setProcessing(true);

        const selectionMatch = text.match(/(recipe|choose|select)\s*(1|2|3|first|second|third|one|two|three)/i);
        if (selectionMatch && this.currentRecipes.length > 0) {
            const idxMap = {
                "1": 0, "first": 0, "one": 0,
                "2": 1, "second": 1, "two": 1,
                "3": 2, "third": 2, "three": 2,
            };
            const idx = idxMap[selectionMatch[2].toLowerCase()];
            if (idx !== undefined && this.currentRecipes[idx]) {
                this.showRecipeDetails(this.currentRecipes[idx]);
                this.hideTypingIndicator();
                this.setProcessing(false);
                return;
            }
        }

        const modificationPhrases = [
            {regex: /(make|add).*spicy|spicier/i, action: "spicy"},
            {regex: /(make|convert).*vegan/i, action: "vegan"},
            {regex: /make.*quick(er)?/i, action: "quick"}
        ];

        for (const phrase of modificationPhrases) {
            if (phrase.regex.test(text)) {
                this.handleModificationRequest(phrase.action);
                this.hideTypingIndicator();
                this.setProcessing(false);
                return;
            }
        }

        this.fetchRecipes(text)
            .catch(err => {
                console.error("Processing error:", err);
                this.addMessage("Sorry, I encountered an error. Please try again.", false);
            })
            .finally(() => {
                this.hideTypingIndicator();
                this.setProcessing(false);
            });
    }

    async fetchRecipes(query, isFollowUp = false, isModification = false) {
        try {
            const csrfToken = this.getCookie("csrftoken");
            const response = await fetch("/search/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": csrfToken,
                },
                body: JSON.stringify({
                    query,
                    is_follow_up: isFollowUp,
                    is_modification: isModification,
                    current_recipe: this.currentRecipe
                })
            });

            if (!response.ok) throw new Error(`Server returned ${response.status}`);

            const data = await response.json();
            if (data.error) throw new Error(data.error);

            if (data.is_recipe) {
                this.currentRecipes = data.results;
                if (data.is_detail) {
                    this.currentRecipe = data.results[0];
                    this.showRecipeDetails(data.results[0]);
                } else {
                    this.displayResults(data.results);
                }
            }

            return data;
        } catch (err) {
            console.error("Fetch recipes error:", err);
            this.addMessage("Couldn't fetch recipes. Please try again.", false);
            throw err;
        }
    }

    displayResults(recipes) {
        if (!recipes || recipes.length === 0) {
            this.addMessage("I couldn't find any matching recipes. Try different ingredients.", false);
            this.showQuickReplies([
                "Vegetarian options",
                "Quick meals",
                "Fewer ingredients"
            ]);
            return;
        }

        // Clear previous results
        this.messagesContainer.querySelectorAll('.recipe-card, .recipe-detail, .quick-replies').forEach(el => el.remove());

        const resultMessages = [
            "🍽️ Here are some recipes I found:",
            "🔍 Here's what I discovered:",
            "📋 Check out these delicious options:"
        ];
        const randomMessage = resultMessages[Math.floor(Math.random() * resultMessages.length)];
        this.addMessage(randomMessage, false);

        // Store the current recipes with their indexes
        this.currentRecipes = recipes.slice(0, 3);

        // Create recipe cards
        this.currentRecipes.forEach((recipe, index) => {
            const recipeCard = this.recipeCardTemplate.content.cloneNode(true);
            const card = recipeCard.querySelector('.recipe-card');
            
            // Add data-index attribute to identify the recipe
            card.dataset.index = index;
            
            card.querySelector('.recipe-title').textContent = `${index + 1}. ${recipe.title}`;
            
            if (recipe.minutes) {
                card.querySelector('.time-value').textContent = `${recipe.minutes} mins`;
            } else {
                const timeEl = card.querySelector('.recipe-time');
                if (timeEl) timeEl.remove();
            }

            this.messagesContainer.appendChild(recipeCard);
        });

        this.showQuickReplies([
            `Tell me about ${this.currentRecipes[0].title}`,
            "More options",
            "Different ingredients"
        ]);
    }

    showRecipeDetails(recipe) {
        // Clear any existing details
        this.messagesContainer.querySelectorAll('.recipe-detail, .quick-replies').forEach(el => el.remove());

        const detailMessages = [
            `🍳 Here's how to make ${recipe.title}:`,
            `👨‍🍳 Let's prepare ${recipe.title}:`,
            `📝 Recipe details for ${recipe.title}:`
        ];
        const randomMessage = detailMessages[Math.floor(Math.random() * detailMessages.length)];
        
        this.addMessage(randomMessage, false);

        const detail = this.recipeDetailTemplate.content.cloneNode(true);
        const card = detail.querySelector('.recipe-detail');

        // Set title and time
        card.querySelector('.recipe-title').textContent = recipe.title;
        if (recipe.minutes) {
            card.querySelector('.time-value').textContent = `${recipe.minutes} minutes`;
        } else {
            const timeEl = card.querySelector('.recipe-time');
            if (timeEl) timeEl.remove();
        }

        // Set ingredients
        const ingredientsList = card.querySelector('.ingredients-list');
        if (Array.isArray(recipe.ingredients)) {
            ingredientsList.innerHTML = recipe.ingredients.map(i => `<li>${i}</li>`).join('');
        } else if (typeof recipe.ingredients === 'string') {
            // Clean up ingredients string if needed
            const cleanedIngredients = recipe.ingredients.split('\n')
                .map(line => line.replace(/^[-•\s]+/, '').trim())
                .filter(line => line.length > 0);
            ingredientsList.innerHTML = cleanedIngredients.map(i => `<li>${i}</li>`).join('');
        } else {
            ingredientsList.innerHTML = '<li>No ingredients listed</li>';
        }

        // Set instructions
        const instructionsList = card.querySelector('.recipe-steps');
        let instructions = recipe.instructions;
        
        // Process instructions
        if (typeof instructions === 'string') {
            // Split by newlines and clean each line
            instructions = instructions.split('\n')
                .map(step => step.replace(/^\d+[.)]\s*|^[-•]\s*/, '').trim())
                .filter(step => step.length > 0);
        }
        
        if (!Array.isArray(instructions)) {  // Fixed: Added missing parenthesis
            instructions = ['No instructions provided'];
        }

        // Populate instructions with custom numbering
        instructionsList.innerHTML = instructions
            .map(step => `<li>${step}</li>`)
            .join('');

        this.messagesContainer.appendChild(detail);
        this.currentRecipe = recipe;
        this.isWaitingForFollowUp = true;

        this.showQuickReplies([
            "Make it spicier",
            "Make it vegan",
            "Make it quicker",
            "Show me other recipes"
        ]);

        // Scroll to show the full recipe
        setTimeout(() => {
            this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
        }, 100);
    }

    handleModificationRequest(modType) {
        if (!this.currentRecipe) {
            this.addMessage("Please select a recipe first before requesting modifications.", false);
            return;
        }

        this.isWaitingForFollowUp = false;
        this.setProcessing(true);
        this.showTypingIndicator();

        const modMessages = {
            spicy: "Making the recipe spicier...",
            vegan: "Converting the recipe to vegan...",
            quick: "Making the recipe quicker to prepare..."
        };

        this.addMessage(modMessages[modType] || "Modifying recipe...", false);

        this.fetchRecipes(`Modify recipe to be ${modType}`, false, true)
            .catch(() => {
                this.addMessage("Sorry, I couldn't modify the recipe.", false);
            })
            .finally(() => {
                this.hideTypingIndicator();
                this.setProcessing(false);
            });
    }


    handleFollowUp(text) {
        if (!this.currentRecipe) {
            this.isWaitingForFollowUp = false;
            this.addMessage("Please select a recipe first before follow-up questions.", false);
            return;
        }

        this.isWaitingForFollowUp = false;
        this.setProcessing(true); // Show overlay
        this.showTypingIndicator();

        this.fetchRecipes(text, true)
            .catch(() => {
                this.addMessage("Sorry, I couldn't process your request.", false);
            })
            .finally(() => {
                this.hideTypingIndicator();
                this.setProcessing(false); // Hide overlay
            });
    }

    addMessage(text, isUser) {
        const messageEl = document.createElement('div');
        messageEl.classList.add('message', isUser ? 'user-message' : 'bot-message');
        messageEl.textContent = text;
        this.messagesContainer.appendChild(messageEl);
        this.scrollToBottom();
    }

    showQuickReplies(phrases) {
        // Remove old quick replies first
        this.messagesContainer.querySelectorAll('.quick-replies').forEach(el => el.remove());

        if (!phrases || phrases.length === 0) return;

        const container = document.createElement('div');
        container.classList.add('quick-replies');

        phrases.forEach(phrase => {
            const btn = document.createElement('button');
            btn.classList.add('quick-reply');
            btn.textContent = phrase;
            btn.addEventListener('click', () => {
                if (this.isProcessing) return;
                this.handleUserInput(phrase);
            });
            container.appendChild(btn);
        });

        this.messagesContainer.appendChild(container);
        this.scrollToBottom();
    }

    showTypingIndicator() {
        if (this.typingIndicator) return;
        this.typingIndicator = this.typingIndicatorTemplate.content.cloneNode(true).children[0];
        this.messagesContainer.appendChild(this.typingIndicator);
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        if (this.typingIndicator) {
            this.typingIndicator.remove();
            this.typingIndicator = null;
        }
    }

    setProcessing(isProcessing) {
        this.isProcessing = isProcessing;
        this.textInput.disabled = isProcessing;
        this.micButton.disabled = isProcessing;
        
        if (isProcessing) {
            this.stopListening();
        }
    }

    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    resetSession() {
        this.currentRecipes = [];
        this.currentRecipe = null;
        this.isWaitingForFollowUp = false;
        this.messagesContainer.innerHTML = '';
        this.showWelcomeMessage();
    }

    getCookie(name) {
        let cookieValue = null;
        if (document.cookie && document.cookie !== '') {
            const cookies = document.cookie.split(';');
            for (let cookie of cookies) {
                cookie = cookie.trim();
                if (cookie.startsWith(name + '=')) {
                    cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                    break;
                }
            }
        }
        return cookieValue;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const assistant = new CookingAssistant();
});