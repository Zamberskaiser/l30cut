-- Modelo isolado proposto. Não é migração para o banco real do Cut.
PRAGMA foreign_keys = ON;
CREATE TABLE projects (
 workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
 PRIMARY KEY(workspace_id, project_id)
);
CREATE TABLE conversations (
 workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
 title TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(workspace_id, project_id, conversation_id),
 FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,project_id)
);
CREATE TABLE messages (
 workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, conversation_id TEXT NOT NULL, message_id TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('user','assistant')), body TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(workspace_id,project_id,conversation_id,message_id),
 FOREIGN KEY(workspace_id,project_id,conversation_id) REFERENCES conversations(workspace_id,project_id,conversation_id)
);
CREATE TABLE documents (
 workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, document_id TEXT NOT NULL, title TEXT NOT NULL,
 PRIMARY KEY(workspace_id,project_id,document_id),
 FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,project_id)
);
CREATE TABLE artifacts (
 workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, artifact_id TEXT NOT NULL, document_id TEXT NOT NULL,
 source_conversation_id TEXT NOT NULL, source_message_id TEXT NOT NULL,
 version INTEGER NOT NULL CHECK(version >= 1), previous_artifact_id TEXT,
 file_name TEXT NOT NULL, storage_key TEXT NOT NULL, mime_type TEXT NOT NULL,
 encoding TEXT NOT NULL, byte_size INTEGER NOT NULL CHECK(byte_size >= 0), sha256 TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('staging','ready','missing','corrupt','deleted')),
 idempotency_key TEXT NOT NULL, created_at TEXT NOT NULL,
 PRIMARY KEY(workspace_id,project_id,artifact_id),
 UNIQUE(workspace_id,project_id,document_id,version),
 UNIQUE(workspace_id,project_id,document_id,artifact_id),
 UNIQUE(workspace_id,project_id,idempotency_key),
 UNIQUE(storage_key),
 CHECK(length(sha256)=64),
 CHECK((version=1 AND previous_artifact_id IS NULL) OR (version>1 AND previous_artifact_id IS NOT NULL)),
 FOREIGN KEY(workspace_id,project_id,document_id) REFERENCES documents(workspace_id,project_id,document_id),
 FOREIGN KEY(workspace_id,project_id,source_conversation_id,source_message_id)
   REFERENCES messages(workspace_id,project_id,conversation_id,message_id),
 FOREIGN KEY(workspace_id,project_id,document_id,previous_artifact_id)
   REFERENCES artifacts(workspace_id,project_id,document_id,artifact_id)
);
CREATE TABLE message_artifacts (
 workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, conversation_id TEXT NOT NULL, message_id TEXT NOT NULL,
 artifact_id TEXT NOT NULL, position INTEGER NOT NULL CHECK(position >= 0),
 PRIMARY KEY(workspace_id,project_id,conversation_id,message_id,artifact_id),
 FOREIGN KEY(workspace_id,project_id,conversation_id,message_id)
   REFERENCES messages(workspace_id,project_id,conversation_id,message_id),
 FOREIGN KEY(workspace_id,project_id,artifact_id) REFERENCES artifacts(workspace_id,project_id,artifact_id)
);
CREATE TABLE clarification_questions (
 workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, conversation_id TEXT NOT NULL, message_id TEXT NOT NULL,
 question_id TEXT NOT NULL, field_name TEXT NOT NULL, question_text TEXT NOT NULL, options_json TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('pending','answered','cancelled','superseded')),
 answer_text TEXT, answer_message_id TEXT,
 PRIMARY KEY(workspace_id,project_id,question_id),
 FOREIGN KEY(workspace_id,project_id,conversation_id,message_id)
   REFERENCES messages(workspace_id,project_id,conversation_id,message_id),
 FOREIGN KEY(workspace_id,project_id,conversation_id,answer_message_id)
   REFERENCES messages(workspace_id,project_id,conversation_id,message_id)
);
CREATE TABLE artifact_journal (
 journal_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL,
 operation_key TEXT NOT NULL, staging_key TEXT NOT NULL,
 phase TEXT NOT NULL CHECK(phase IN ('reserved','written','verified','registered','failed')),
 created_at TEXT NOT NULL, last_error TEXT,
 UNIQUE(workspace_id,project_id,operation_key),
 FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,project_id)
);
-- A aplicação ainda deve validar caminhos, hashes, estados, encadeamento de versões,
-- atomicidade/recuperação, autorização e igualdade dos bytes. DDL não faz I/O de mídia.
