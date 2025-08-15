import os
from flask import Flask, render_template, request, jsonify
import google.generativeai as genai
from dotenv import load_dotenv

app = Flask(__name__)

from dotenv import load_dotenv
load_dotenv()

API_KEY = os.getenv("GENAI_API_KEY")
genai.configure(api_key=API_KEY)
model = genai.GenerativeModel(model_name="models/gemini-2.5-flash")


@app.route("/")
def index():
    return render_template("index.html")


def build_conversation_text(history):
    """
    history: list of {role: 'user'|'assistant'|'system', content: '...'}
    Returns a single string representing the past conversation, e.g.:
      User: ...
      Assistant: ...
    """
    if not history:
        return ""
    lines = []
    for item in history:
        role = None
        content = None
        if isinstance(item, dict):
            role = item.get("role")
            content = item.get("content")
        else:
            try:
                role, content = item
            except Exception:
                continue
        if not content:
            continue
        if role == "user":
            lines.append(f"User: {content}")
        elif role == "assistant":
            lines.append(f"Assistant: {content}")
        elif role == "system":
            lines.append(f"System: {content}")
        else:
            lines.append(f"User: {content}")
    return "\n".join(lines)


@app.route("/chat", methods=["POST"])
def chat():
    data = request.json or {}
    message = (data.get("message") or "").strip()
    personality = data.get("personality", "Neutral")
    history = data.get("history", [])  # expected: [{role, content}, ...]

    if not message:
        return jsonify({"response": "[ERROR] No message provided."})

    # Build a single conversation block from history (if any)
    conversation_block = build_conversation_text(history)

    # Compose final prompt. Allow emojis and preserve formatting.
    prompt_parts = [
        f"You are a helpful chatbot with a {personality} personality.",
        "Follow the user's tone.",
        # allow emojis and plain text
        "IMPORTANT: Return plain text only (no surrounding quotes, no HTML), preserve line breaks, "
        "and you are allowed to use emojis (e.g. 😊, 👍) when they help convey tone.",
        "",
    ]
    if conversation_block:
        prompt_parts.append("Conversation history:")
        prompt_parts.append(conversation_block)
        prompt_parts.append("")

    prompt_parts.append("User's new message:")
    prompt_parts.append(message)
    prompt_parts.append("")  # ensures assistant prompt ends on a new line
    prompt_parts.append("Assistant:")

    prompt = "\n".join(prompt_parts)

    try:
        # Try expressive call first (encourages emojis). If this kwarg isn't supported,
        # fall back to the default call.
        try:
            response = model.generate_content(prompt, temperature=0.7)
        except TypeError:
            response = model.generate_content(prompt)
        text = getattr(response, "text", None)
        if text is None:
            text = str(response)
        return jsonify({"response": text})
    except Exception as e:
        return jsonify({"response": f"[ERROR] Gemini API issue: {e}"}), 500


@app.route("/summarize", methods=["POST"])
def summarize():
    data = request.json or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"title": ""})

    prompt = (
        "Create a concise chat title (3-6 words) that summarizes the topic "
        "of this short conversation. Keep it short and descriptive. Do not return punctuation-only titles.\n\n"
        f"Conversation: {text}\n\nTitle:"
    )

    try:
        response = model.generate_content(prompt)
        title = (response.text or "").strip().splitlines()[0] if getattr(response, "text", None) else ""
        title = title[:60].strip()
        return jsonify({"title": title})
    except Exception:
        return jsonify({"title": ""}), 500


if __name__ == "__main__":
    app.run(debug=True)
