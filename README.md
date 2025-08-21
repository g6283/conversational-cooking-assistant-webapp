# ChefMate: Conversational AI Cooking Assistant

ChefMate is a web-based AI assistant that helps users discover, modify, and interact with recipes using natural language. Built with Django, FAISS, and OpenRouter (LLM), ChefMate provides personalized cooking suggestions through semantic search and contextual modifications.

---

## 🚀 Features

- 🔍 **Semantic Recipe Search** using FAISS and Sentence Embeddings
- 🧠 **LLM-Powered Modifications** (e.g., “Make it vegan”)
- 🗣️ **Conversational Interaction** via chat interface
- 📊 **Recipe Metadata**: Cooking time, ingredients, dietary preference
- 🌐 **Frontend Integration** using JavaScript and AJAX for real-time interaction

---

## 🏗️ Project Structure

```
chefmate/
├── assistant/
│   ├── migrations/
│   ├── static/
│   │   ├── assistant.js
│   │   └── assistant.css
│   ├── templates/
│   │   └── index.html
│   ├── views.py
│   ├── urls.py
│   └── __init__.py
├── chefmate/
│   ├── settings.py
│   ├── urls.py
│   └── wsgi.py
├── recipe_data/
│   ├── faiss_index_recipe_embeddings.index  # (ignored in .gitignore)
│   ├── recipe_metadata.json                # (ignored in .gitignore)
│   └── embeddings/
├── manage.py
├── requirements.txt
└── README.md
```

---

## ⚙️ How It Works

### 🔎 Semantic Search with FAISS

- Recipes are embedded using `sentence-transformers`
- A FAISS index enables fast similarity lookup
- Search is based on cosine similarity between user query and recipe descriptions

### 🧠 LLM Recipe Modification (OpenRouter)

- OpenRouter LLM is called using a dynamic prompt
- Incorporates user queries + matched recipe + intent (e.g., "make it spicy")
- API response is parsed and displayed to the user

### 📡 Frontend Interaction

- Chat interface built with HTML/CSS/JavaScript
- AJAX used to make asynchronous requests to Django views
- Responses are rendered in real-time

---

## 📝 Setup Instructions

### 🔧 Installation

```bash
git clone https://github.com/your-username/chefmate.git
cd chefmate
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 🔑 Add your OpenRouter API key

Set your API key in `views.py`:

```python
headers = {
    "Authorization": "Bearer YOUR_OPENROUTER_API_KEY",
}
```

---

## 🏃 Running the App

```bash
python manage.py runserver
```

Then visit: [http://127.0.0.1:8000](http://127.0.0.1:8000)

---

## 📂 .gitignore (Important!)

Make sure to **ignore large files** like the FAISS index and metadata:

```
recipe_data/faiss_index_recipe_embeddings.index
recipe_data/recipe_metadata.json
*.pt
*.ckpt
__pycache__/
*.pyc
*.pkl
*.log
.env
venv/
```

---

## ✅ Requirements

Install all required dependencies using:

```bash
pip install -r requirements.txt
```

---

## 📸 Demo Screenshot (Add Later)

_Add a screenshot or GIF showing the search and conversation in action_

---

## 🧪 Testing

```bash
python manage.py test
```

---

## 🛠️ Future Improvements

- Voice input and speech synthesis
- Multi-user session handling
- Nutrition facts integration
- Add save-to-favorites feature

---

## 📬 Contact

For any issues, please open an issue in the repository.