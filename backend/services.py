import io
import json
import re
from pathlib import Path
from typing import Any

import openai

from backend.settings import settings
from backend.storage import StorageAdapter, utc_now
from scripts.analyze_gioia import analyze_gioia
from scripts.export_results import export_format
from scripts.simulate_interviews import simulate_interview
from utils.pdf_parser import extract_questions_with_ai, extract_text_from_pdf, validate_and_improve_questions
from utils.persona_parser import (
    extract_persona_info_with_ai,
    extract_text_from_docx,
    extract_text_from_pdf_persona,
    validate_persona_data,
)


DEFAULT_PROTOCOL = {
    "name": "Default Protocol",
    "shared_context": "",
    "interview_style_guidance": (
        "Answer like a real participant in an interview. Use concrete language, acknowledge uncertainty when appropriate, "
        "and avoid sounding like a summary report."
    ),
    "consistency_rules": (
        "Stay consistent with the persona across all questions. Do not become more polished, confident, or generic as the interview continues."
    ),
    "analysis_focus": (
        "Pay attention to differences in specificity, emotional texture, lived context, and whether the AI sounds too tidy or generalized."
    ),
}

CONSENT_PENDING = "pending"
CONSENT_ACCEPTED = "accepted"
CONSENT_DECLINED = "declined"


class ResearchBackendService:
    def __init__(self, storage: StorageAdapter):
        self.storage = storage

    @staticmethod
    def _owner_filters(user_id: str) -> dict[str, Any]:
        return {"owner_user_id": user_id}

    def list_collection(self, collection: str, user_id: str, study_id: str | None = None) -> list[dict[str, Any]]:
        items = self.storage.list_items(collection, filters=self._owner_filters(user_id))
        if study_id is None:
            return items
        return [item for item in items if item.get("study_id") == study_id]

    def get_item(self, collection: str, item_id: str, user_id: str) -> dict[str, Any]:
        item = self.storage.get_item(collection, item_id, filters=self._owner_filters(user_id))
        if not item:
            raise ValueError(f"{collection.rstrip('s').title()} not found.")
        return item

    def save_study(self, study: dict[str, Any], user_id: str) -> dict[str, Any]:
        study["owner_user_id"] = user_id
        return self.storage.upsert_item("studies", study)

    def ensure_study_exists(self, study_id: str | None, user_id: str) -> None:
        if study_id is None:
            return
        self.get_item("studies", study_id, user_id)

    def get_user_data_consent(self, user_id: str) -> dict[str, Any]:
        records = self.storage.list_items("user_data_consents", filters=self._owner_filters(user_id))
        if not records:
            return {
                "status": CONSENT_PENDING,
                "allows_analytics": False,
                "consented_at": None,
                "updated_at": None,
            }

        record = records[0]
        status = record.get("status") or CONSENT_PENDING
        return {
            "status": status,
            "allows_analytics": status == CONSENT_ACCEPTED,
            "consented_at": record.get("consented_at"),
            "updated_at": record.get("updated_at"),
        }

    def set_user_data_consent(self, user_id: str, status: str) -> dict[str, Any]:
        existing_records = self.storage.list_items("user_data_consents", filters=self._owner_filters(user_id))
        record = existing_records[0] if existing_records else {}
        consented_at = utc_now().isoformat() if status == CONSENT_ACCEPTED else None

        record.update(
            {
                "owner_user_id": user_id,
                "status": status,
                "consented_at": consented_at,
            }
        )
        saved = self.storage.upsert_item("user_data_consents", record)
        return {
            "status": saved.get("status") or CONSENT_PENDING,
            "allows_analytics": saved.get("status") == CONSENT_ACCEPTED,
            "consented_at": saved.get("consented_at"),
            "updated_at": saved.get("updated_at"),
        }

    def save_protocol(self, protocol: dict[str, Any], user_id: str) -> dict[str, Any]:
        self.ensure_study_exists(protocol.get("study_id"), user_id)
        protocol["owner_user_id"] = user_id
        return self.storage.upsert_item("protocols", protocol)

    def save_persona(self, persona: dict[str, Any], user_id: str) -> dict[str, Any]:
        persona = validate_persona_data(persona)
        self.ensure_study_exists(persona.get("study_id"), user_id)
        persona["owner_user_id"] = user_id
        return self.storage.upsert_item("personas", persona)

    def extract_persona(self, text: str, user_id: str, suggested_name: str | None = None) -> dict[str, Any]:
        persona_counter = len(self.storage.list_items("personas", filters=self._owner_filters(user_id))) + 1
        persona = extract_persona_info_with_ai(text, persona_counter)
        if suggested_name and suggested_name.strip():
            persona["name"] = suggested_name.strip()
        return validate_persona_data(persona)

    def save_question_guide(
        self, name: str, questions: list[str], user_id: str, study_id: str | None = None
    ) -> dict[str, Any]:
        self.ensure_study_exists(study_id, user_id)
        return self.storage.upsert_item(
            "question_guides",
            {"name": name, "questions": questions, "study_id": study_id, "owner_user_id": user_id},
        )

    def save_transcript(
        self, name: str, content: str, user_id: str, source_type: str = "text", study_id: str | None = None
    ) -> dict[str, Any]:
        self.ensure_study_exists(study_id, user_id)
        return self.storage.upsert_item(
            "transcripts",
            {
                "name": name,
                "content": content,
                "source_type": source_type,
                "study_id": study_id,
                "owner_user_id": user_id,
            },
        )

    def extract_questions(self, text: str, improve_with_ai: bool = False) -> list[str]:
        questions = extract_questions_with_ai(text)
        if improve_with_ai and questions:
            questions = validate_and_improve_questions(questions)
        return questions

    def run_simulation(
        self,
        persona_id: str,
        question_guide_id: str,
        user_id: str,
        protocol_id: str | None = None,
        study_id: str | None = None,
    ) -> dict[str, Any]:
        persona = self.get_item("personas", persona_id, user_id)
        guide = self.get_item("question_guides", question_guide_id, user_id)
        protocol = self.get_item("protocols", protocol_id, user_id) if protocol_id else DEFAULT_PROTOCOL
        resolved_study_id = study_id or persona.get("study_id") or guide.get("study_id") or protocol.get("study_id")
        self.ensure_study_exists(resolved_study_id, user_id)

        from tempfile import NamedTemporaryFile

        with NamedTemporaryFile("w+", suffix=".json", delete=True) as persona_file, NamedTemporaryFile(
            "w+", suffix=".txt", delete=True
        ) as questions_file, NamedTemporaryFile("w+", suffix=".json", delete=True) as output_file:
            json.dump(persona, persona_file)
            persona_file.flush()
            questions_file.write("\n".join(guide["questions"]))
            questions_file.flush()
            responses = simulate_interview(
                persona_file.name,
                questions_file.name,
                output_file.name,
                settings={
                    "shared_context": protocol.get("shared_context", ""),
                    "interview_style": protocol.get("interview_style_guidance", ""),
                    "consistency_rules": protocol.get("consistency_rules", ""),
                    "analysis_focus": protocol.get("analysis_focus", ""),
                    "protocol_name": protocol.get("name", "Default Protocol"),
                },
            )
        simulation = {
            "persona_id": persona_id,
            "question_guide_id": question_guide_id,
            "protocol_id": protocol_id,
            "study_id": resolved_study_id,
            "owner_user_id": user_id,
            "responses": responses,
            "created_at": utc_now().isoformat(),
        }
        return self.storage.upsert_item("simulations", simulation)

    def run_ai_gioia(
        self, simulation_id: str, user_id: str, protocol_id: str | None = None, study_id: str | None = None
    ) -> dict[str, Any]:
        simulation = self.get_item("simulations", simulation_id, user_id)
        protocol = self.get_item("protocols", protocol_id, user_id) if protocol_id else DEFAULT_PROTOCOL
        resolved_study_id = study_id or simulation.get("study_id") or protocol.get("study_id")
        self.ensure_study_exists(resolved_study_id, user_id)

        from tempfile import NamedTemporaryFile

        with NamedTemporaryFile("w+", suffix=".json", delete=True) as simulation_file, NamedTemporaryFile(
            "w+", suffix=".md", delete=True
        ) as output_file:
            json.dump(simulation["responses"], simulation_file)
            simulation_file.flush()
            markdown = analyze_gioia(
                simulation_file.name,
                output_file.name,
                settings={"analysis_focus": protocol.get("analysis_focus", "")},
            )

        result = {
            "simulation_id": simulation_id,
            "protocol_id": protocol_id,
            "study_id": resolved_study_id,
            "owner_user_id": user_id,
            "markdown": markdown,
            "created_at": utc_now().isoformat(),
        }
        return self.storage.upsert_item("gioia_analyses", result)

    def run_structured_comparison(
        self,
        transcript_id: str,
        simulation_id: str,
        user_id: str,
        protocol_id: str | None = None,
        study_id: str | None = None,
    ) -> dict[str, Any]:
        transcript = self.get_item("transcripts", transcript_id, user_id)
        simulation = self.get_item("simulations", simulation_id, user_id)
        protocol = self.get_item("protocols", protocol_id, user_id) if protocol_id else DEFAULT_PROTOCOL
        resolved_study_id = study_id or transcript.get("study_id") or simulation.get("study_id") or protocol.get("study_id")
        self.ensure_study_exists(resolved_study_id, user_id)

        client = openai.OpenAI(api_key=settings.openai_api_key)
        ai_text = "\n".join([f"Q: {item['question']}\nA: {item['answer']}" for item in simulation["responses"]])
        prompt = f"""
        Compare a real interview transcript against an AI-generated interview and return valid JSON only.

        Use this structure exactly:
        {{
          "overview": {{
            "real_summary": "...",
            "ai_summary": "...",
            "key_takeaway": "..."
          }},
          "comparison_table": [
            {{
              "theme": "...",
              "real_pattern": "...",
              "ai_pattern": "...",
              "difference": "...",
              "research_implication": "..."
            }}
          ],
          "quotes": {{
            "real": [
              {{"theme": "...", "quote": "...", "why_it_matters": "..."}}
            ],
            "ai": [
              {{"theme": "...", "quote": "...", "why_it_matters": "..."}}
            ]
          }},
          "theme_review": [
            {{
              "dimension": "...",
              "theme": "...",
              "first_order_concepts": ["...", "..."],
              "real_evidence": "...",
              "ai_evidence": "...",
              "review_note": "..."
            }}
          ],
          "markdown_report": "..."
        }}

        Additional analysis focus:
        {protocol.get("analysis_focus", "")}

        Real transcript:
        {transcript["content"][:6000]}

        AI transcript:
        {ai_text[:6000]}
        """
        response = client.chat.completions.create(
            model="gpt-3.5-turbo",
            messages=[
                {
                    "role": "system",
                    "content": "You are an expert qualitative researcher. Return valid JSON only.",
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=2200,
            temperature=0.3,
        )
        payload = self._extract_json_payload(response.choices[0].message.content)
        result = {
            "transcript_id": transcript_id,
            "simulation_id": simulation_id,
            "protocol_id": protocol_id,
            "study_id": resolved_study_id,
            "owner_user_id": user_id,
            "payload": payload or {"markdown_report": response.choices[0].message.content},
            "created_at": utc_now().isoformat(),
        }
        return self.storage.upsert_item("comparisons", result)

    def export_simulation(self, simulation_id: str, user_id: str, file_type: str) -> str:
        simulation = self.get_item("simulations", simulation_id, user_id)
        export_root = settings.local_storage_root / "generated_exports"
        export_root.mkdir(parents=True, exist_ok=True)
        from tempfile import NamedTemporaryFile

        with NamedTemporaryFile("w+", suffix=".json", delete=True) as simulation_file:
            json.dump(simulation["responses"], simulation_file)
            simulation_file.flush()
            return export_format(
                simulation_file.name,
                f"simulation_{simulation_id}",
                file_type=file_type,
                output_dir=str(export_root),
            )

    def extract_text_from_upload(self, filename: str, content_type: str, file_bytes: bytes) -> str:
        buffer = io.BytesIO(file_bytes)
        buffer.name = filename
        if content_type == "application/pdf" or filename.lower().endswith(".pdf"):
            return extract_text_from_pdf(buffer)
        if (
            content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            or filename.lower().endswith(".docx")
        ):
            return extract_text_from_docx(buffer)
        try:
            return file_bytes.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ValueError("Uploaded text files must be valid UTF-8.") from exc

    def extract_persona_text_from_upload(self, filename: str, content_type: str, file_bytes: bytes) -> str:
        buffer = io.BytesIO(file_bytes)
        buffer.name = filename
        if content_type == "application/pdf" or filename.lower().endswith(".pdf"):
            return extract_text_from_pdf_persona(buffer)
        if (
            content_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            or filename.lower().endswith(".docx")
        ):
            return extract_text_from_docx(buffer)
        try:
            return file_bytes.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise ValueError("Uploaded text files must be valid UTF-8.") from exc

    @staticmethod
    def _extract_json_payload(raw_text: str) -> dict[str, Any] | None:
        try:
            return json.loads(raw_text.strip())
        except json.JSONDecodeError:
            match = re.search(r"\{.*\}", raw_text, re.DOTALL)
            if not match:
                return None
            try:
                return json.loads(match.group(0))
            except json.JSONDecodeError:
                return None
