import json
import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from backend import support_chat


class SupportChatTests(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(support_chat.router)
        self.client = TestClient(self.app)
        self.user_id = str(uuid4())
        self.auth = patch.object(support_chat, 'require_authenticated_user', return_value=SimpleNamespace(user_id=self.user_id))
        self.auth.start()
        self.addCleanup(self.auth.stop)
        self.config = patch.object(support_chat, 'settings', SimpleNamespace(customer_agent_url='https://desk.example', customer_agent_access_token='test-access', customer_agent_bridge_secret='test-bridge'))
        self.config.start()
        self.addCleanup(self.config.stop)

    def test_proxy_uses_authenticated_owner_and_keeps_secrets_out_of_payload(self):
        fake = MagicMock()
        fake.__enter__.return_value.read.return_value = json.dumps({'answer':'Try selecting your study.', 'ticket_id':None}).encode()
        with patch.object(support_chat, 'urlopen', return_value=fake) as call:
            r = self.client.post('/api/support-chat/messages', json={'conversation_id':str(uuid4()),'request_id':str(uuid4()),'message':'How do I start?','customer_id':'somebody-else'})
        self.assertEqual(r.status_code, 200)
        request = call.call_args.args[0]
        self.assertEqual(request.get_header('X-studio-customer-id'), self.user_id)
        self.assertEqual(request.get_header('Oai-sites-authorization'), 'Bearer test-access')
        self.assertNotIn('customer_id', json.loads(request.data))
        self.assertNotIn('test-access', r.text)

    def test_authentication_required(self):
        with patch.object(support_chat, 'require_authenticated_user', side_effect=HTTPException(401, 'Sign in')):
            self.assertEqual(self.client.post('/api/support-chat/conversations').status_code, 401)

    def test_unsafe_payload_is_rejected_before_network(self):
        with patch.object(support_chat, 'urlopen') as call:
            self.assertEqual(self.client.post('/api/support-chat/messages', json={'conversation_id':'bad','message':'hello'}).status_code,422)
            call.assert_not_called()

    def test_upstream_failure_is_sanitized(self):
        with patch.object(support_chat, 'urlopen', side_effect=HTTPError('https://secret.example',401,'private credentials',None,None)):
            r=self.client.post('/api/support-chat/conversations')
        self.assertEqual(r.status_code,503)
        self.assertNotIn('private credentials',r.text)
        self.assertNotIn('secret.example',r.text)


if __name__ == '__main__':
    unittest.main()
