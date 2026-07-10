"use client";

import { KeyboardEvent, useState } from "react";
import { X } from "lucide-react";

type TagInputProps = {
  value: string[];
  onChange: (tags: string[]) => void;
  label?: string;
  inputId?: string;
};

export function TagInput({ value, onChange, label = "Tags", inputId = "exercise-tags" }: TagInputProps) {
  const [draft, setDraft] = useState("");

  function addTag(rawTag: string) {
    const tag = rawTag.trim().replace(/\s+/g, " ").toLowerCase();
    if (tag && !value.includes(tag)) {
      onChange([...value, tag]);
    }
    setDraft("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(draft);
    }
    if (event.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  return (
    <div className="field">
      <label htmlFor={inputId}>{label}</label>
      <div className="tag-input">
        {value.map((tag) => (
          <span className="tag-chip" key={tag}>
            {tag}
            <button type="button" onClick={() => onChange(value.filter((item) => item !== tag))} aria-label={`Remove ${tag} tag`}>
              <X size={14} />
            </button>
          </span>
        ))}
        <input
          id={inputId}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addTag(draft)}
          placeholder={value.length ? "Add another tag" : "Type a tag and press Enter"}
        />
      </div>
      <p className="muted">Use tags such as knee, home, beginner, or return to sport.</p>
    </div>
  );
}
