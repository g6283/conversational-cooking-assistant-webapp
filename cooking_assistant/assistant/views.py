from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import ensure_csrf_cookie, csrf_exempt
import json
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer
import os
import re
import requests
from dotenv import load_dotenv
import logging

# Setup logger
logger = logging.getLogger(__name__)

# Load environment variables
load_dotenv()

# Load resources
resource_dir = os.path.join(os.path.dirname(__file__), "data")
index = faiss.read_index(os.path.join(resource_dir, "faiss_index_recipe_embeddings.index"))
with open(os.path.join(resource_dir, "recipe_metadata.json"), "r", encoding="utf-8") as f:
    metadata = json.load(f)
model = SentenceTransformer("all-MiniLM-L6-v2")

@ensure_csrf_cookie
def home(request):
    """Render the main interface page"""
    return render(request, "assistant/index.html")

def parse_instructions_to_steps(instruction_text):
    """Convert instruction text into numbered steps"""
    if not instruction_text:
        return []
    raw_steps = re.split(r"\n+|\d+\.\s+", instruction_text)
    steps = [step.strip() for step in raw_steps if step.strip()]
    return [f"{i+1}. {step}" for i, step in enumerate(steps)]

def format_recipe_with_openrouter(recipe):
    """
    Format recipe using NLP to ensure consistent structure
    Returns: (formatted_recipe_dict, success_bool)
    """
    prompt = f"""
    Please format this recipe into a clean, standardized structure. Return ONLY valid JSON with these keys:
    - title (cleaned up if needed)
    - ingredients (as a clear list with standardized measurements)
    - instructions (as numbered steps)
    - minutes (cooking time if available)
    - notes (any additional notes)
    
    For ingredients:
    - Convert all measurements to standard units (cups, tbsp, etc.)
    - Group similar items together
    - Ensure consistent formatting
    
    For instructions:
    - Break into clear numbered steps
    - Each step should be a complete sentence
    - Include all necessary details
    
    Recipe to format:
    {json.dumps(recipe, indent=2)}
    """

    try:
        reply = call_openrouter(prompt, json_mode=True)

        # Improved JSON extraction with better error handling
        json_str = reply.strip()
        
        # Remove markdown code blocks if present
        if json_str.startswith('```json') and json_str.endswith('```'):
            json_str = json_str[7:-3].strip()
        elif json_str.startswith('```') and json_str.endswith('```'):
            json_str = json_str[3:-3].strip()
            
        # Try to parse the JSON
        try:
            formatted = json.loads(json_str)
        except json.JSONDecodeError as e:
            # Try to find the JSON part if it's embedded in other text
            try:
                json_start = json_str.find('{')
                json_end = json_str.rfind('}') + 1
                if json_start != -1 and json_end != -1:
                    formatted = json.loads(json_str[json_start:json_end])
                else:
                    raise e
            except:
                raise ValueError(f"Invalid JSON format in response: {json_str[:200]}...")

        # Validate required fields
        required_keys = {"title", "ingredients", "instructions"}
        if not all(k in formatted for k in required_keys):
            raise ValueError("Missing required fields in response")

        return formatted, True

    except Exception as e:
        logger.warning(f"Recipe formatting error: {str(e)}")
        # If formatting fails, return the original recipe with basic parsing
        recipe['instructions'] = parse_instructions_to_steps(recipe.get('instructions', ''))
        if isinstance(recipe.get('ingredients'), str):
            recipe['ingredients'] = [i.strip() for i in recipe['ingredients'].split('\n') if i.strip()]
        return recipe, False

def call_openrouter(prompt, json_mode=False):
    """Helper function to call OpenRouter API"""
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise ValueError("OpenRouter API key not configured")

    referer = os.getenv("APP_URL", "http://localhost:8000")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "HTTP-Referer": referer,
        "X-Title": "Cooking Assistant"
    }

    data = {
        "model": "mistralai/mistral-7b-instruct",
        "messages": [
            {
                "role": "system", 
                "content": "You are a professional chef assistant. Return ONLY valid JSON with the exact specified keys. Do not include any additional text or explanations outside the JSON structure."
            },
            {
                "role": "user", 
                "content": prompt
            }
        ],
        "temperature": 0.3,  # Lower temperature for more consistent JSON
        "max_tokens": 2000
    }

    if json_mode:
        data["response_format"] = {"type": "json_object"}
        # More explicit instruction for JSON mode
        data["messages"][0]["content"] += " The response must be pure JSON without any surrounding text or markdown."

    try:
        response = requests.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers=headers,
            json=data,
            timeout=30  # Increased timeout
        )
        response.raise_for_status()
        content = response.json()['choices'][0]['message']['content']
        
        # Basic validation of the response
        if json_mode and not content.strip().startswith('{'):
            raise ValueError("Response is not in JSON format")
            
        return content
    except requests.exceptions.RequestException as e:
        raise Exception(f"API request failed: {str(e)}")

def modify_recipe_with_openrouter(recipe, modification):
    """
    Helper function to modify recipes using OpenRouter API
    Returns: (modified_recipe_dict, success_bool)
    """
    prompt = f"""
    Modify this recipe to be {modification}. Return ONLY valid JSON with these keys:
    - title (updated if needed)
    - ingredients (modified list with standardized measurements)
    - instructions (updated as numbered steps)
    - minutes (adjusted time if needed)
    - notes (brief explanation of changes)
    
    IMPORTANT: 
    - Make substantial changes to actually fulfill the modification request
    - Format ingredients and instructions clearly
    - For vegan: replace all animal products with plant-based alternatives
    - For spicier: add or increase spicy ingredients
    - For quicker: suggest time-saving techniques
    
    Original Recipe:
    {json.dumps(recipe, indent=2)}
    """

    try:
        reply = call_openrouter(prompt, json_mode=True)

        if '```json' in reply:
            json_str = reply.split('```json')[1].split('```')[0]
        else:
            json_str = reply.strip()

        modified = json.loads(json_str)

        # Validate required fields
        required_keys = {"title", "ingredients", "instructions"}
        if not all(k in modified for k in required_keys):
            raise ValueError("Missing required fields in response")

        # Ensure the modification was actually applied
        if json.dumps(recipe) == json.dumps({k: modified[k] for k in required_keys}):
            raise ValueError("Recipe was not actually modified")

        return modified, True

    except Exception as e:
        logger.warning(f"Recipe modification error: {str(e)}")
        return {
            "error": f"Couldn't modify recipe: {str(e)}",
            "raw_response": reply[:500] if 'reply' in locals() else None
        }, False

def format_recipe_response(recipe):
    """Ensure consistent recipe formatting before sending to client"""
    formatted, success = format_recipe_with_openrouter(recipe)
    if not success:
        formatted = recipe  # Use original if formatting failed

    # Ensure instructions are properly formatted
    if isinstance(formatted.get('instructions'), str):
        formatted['instructions'] = parse_instructions_to_steps(formatted['instructions'])

    # Ensure ingredients are a list
    if isinstance(formatted.get('ingredients'), str):
        formatted['ingredients'] = [i.strip() for i in formatted['ingredients'].split('\n') if i.strip()]

    return formatted

@csrf_exempt
def modify_recipe(request):
    """API endpoint for recipe modifications"""
    if request.method != "POST":
        return JsonResponse({"error": "Only POST requests allowed"}, status=405)

    try:
        data = json.loads(request.body)
        recipe = data.get("recipe")
        modification = data.get("modification")

        if not recipe or not modification:
            return JsonResponse({"error": "Missing recipe or modification"}, status=400)

        modified, success = modify_recipe_with_openrouter(recipe, modification)

        if not success:
            return JsonResponse(modified, status=400)

        # Format the modified recipe before returning
        formatted_recipe = format_recipe_response(modified)

        # Update session if needed
        if hasattr(request, 'session'):
            request.session.setdefault("modified_recipes", {})
            recipe_id = recipe.get("id", hash(recipe["title"]))
            request.session["modified_recipes"][str(recipe_id)] = formatted_recipe

        return JsonResponse(formatted_recipe)

    except json.JSONDecodeError:
        return JsonResponse({"error": "Invalid JSON input"}, status=400)
    except Exception as e:
        return JsonResponse({"error": str(e)}, status=500)

@csrf_exempt
def search_recipes(request):
    """Main recipe search endpoint"""
    if request.method != "POST":
        return JsonResponse({"error": "Only POST requests allowed"}, status=405)

    if not hasattr(request, 'session'):
        return JsonResponse({"error": "Session middleware not installed"}, status=500)

    try:
        data = json.loads(request.body)
        query = data.get("query", "").strip().lower()
        is_follow_up = data.get("is_follow_up", False)
        is_modification = data.get("is_modification", False)
        current_recipe = data.get("current_recipe", None)

        # Initialize session
        request.session.setdefault("ingredients", "")
        request.session.setdefault("preferences", "")
        request.session.setdefault("current_results", [])
        request.session.setdefault("modified_recipes", {})

        # Handle recipe modifications
        if is_modification and current_recipe:
            modified, success = modify_recipe_with_openrouter(current_recipe, query)

            if not success:
                modified = {
                    **current_recipe,
                    "notes": f"Modification failed: {modified.get('error', 'Unknown error')}"
                }

            formatted_recipe = format_recipe_response(modified)
            recipe_id = current_recipe.get("id", hash(current_recipe["title"]))
            request.session["modified_recipes"][str(recipe_id)] = formatted_recipe

            return JsonResponse({
                "results": [formatted_recipe],
                "is_recipe": True,
                "is_detail": True,
                "session": {
                    "ingredients": request.session.get("ingredients", ""),
                    "preferences": request.session.get("preferences", ""),
                    "modified_recipes": request.session.get("modified_recipes", {})
                },
                "processing": False
            })

        # Handle session reset
        reset_commands = ["reset", "start over", "clear session", "new session", "begin again"]
        if any(kw in query for kw in reset_commands):
            request.session.flush()
            return JsonResponse({
                "message": "Session cleared. Ready to start fresh!",
                "reset": True,
                "session": {
                    "ingredients": "",
                    "preferences": "",
                    "modified_recipes": {}
                },
                "processing": False
            })

        # Handle recipe selection (follow-up queries)
        if is_follow_up and re.search(r'(recipe|choose|select|first|second|third|1|2|3)', query):
            selected_idx = 0
            if re.search(r'\b(1|first)\b', query):
                selected_idx = 0
            elif re.search(r'\b(2|second)\b', query):
                selected_idx = 1
            elif re.search(r'\b(3|third)\b', query):
                selected_idx = 2

            results = request.session.get("current_results", [])
            if not results:
                return JsonResponse({"error": "No current results in session"}, status=400)

            if len(results) > selected_idx:
                formatted_recipe = format_recipe_response(results[selected_idx])
                return JsonResponse({
                    "results": [formatted_recipe],
                    "is_recipe": True,
                    "is_detail": True,
                    "session": {
                        "ingredients": request.session.get("ingredients", ""),
                        "preferences": request.session.get("preferences", ""),
                        "modified_recipes": request.session.get("modified_recipes", {})
                    },
                    "processing": False
                })
            else:
                return JsonResponse({"error": "Selected recipe index out of range"}, status=400)

        # Prepare search query
        is_refinement = any(phrase in query for phrase in [
            "make it", "add", "prefer", "more", "less", "quick",
            "spicy", "healthy", "without", "with", "vegan", "vegetarian"])

        if not is_refinement and not is_follow_up:
            request.session["ingredients"] = query
            request.session["preferences"] = ""
            combined_query = query
        else:
            request.session["preferences"] += " " + query
            combined_query = request.session["ingredients"] + " " + request.session["preferences"]

        # Perform search
        embedding = model.encode([combined_query], convert_to_numpy=True).astype(np.float32)
        distances, indices = index.search(embedding, 5)

        results = []
        for i in indices[0]:
            if 0 <= i < len(metadata):
                recipe = metadata[i]
                formatted_recipe = format_recipe_response(recipe)
                results.append(formatted_recipe)

        request.session["current_results"] = results

        # *** Removed Q&A fallback block here ***

        return JsonResponse({
            "results": results,
            "is_recipe": True,
            "is_detail": False,
            "session": {
                "ingredients": request.session.get("ingredients", ""),
                "preferences": request.session.get("preferences", ""),
                "modified_recipes": request.session.get("modified_recipes", {})
            },
            "processing": False
        })

    except json.JSONDecodeError as e:
        return JsonResponse({"error": "Invalid JSON format", "details": str(e)}, status=400)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return JsonResponse({"error": "Internal server error", "details": str(e)}, status=500)

@csrf_exempt
def reset_session(request):
    """Endpoint to clear the current session"""
    if hasattr(request, 'session'):
        request.session.flush()
        request.session["ingredients"] = ""
        request.session["preferences"] = ""
        request.session["current_results"] = []
        request.session["modified_recipes"] = {}
    return JsonResponse({
        "message": "Session cleared. Ready to start fresh!",
        "reset": True,
        "session": {
            "ingredients": "",
            "preferences": "",
            "modified_recipes": {}
        },
        "processing": False
    })