from __future__ import annotations
import importlib.util
from pathlib import Path
import unittest

SCRIPT=Path(__file__).resolve().parents[1]/'run_model_matrix.py'
spec=importlib.util.spec_from_file_location('run_model_matrix',SCRIPT); matrix=importlib.util.module_from_spec(spec); assert spec.loader; spec.loader.exec_module(matrix)

class ModelMatrixTests(unittest.TestCase):
 def test_schema_is_closed_and_strict(self):
  schema=matrix.output_schema(['query'],['query_existing_work'])
  self.assertEqual(schema['additionalProperties'],False)
  self.assertEqual(schema['properties']['category']['enum'],['query'])
 def test_request_hash_changes_when_input_changes(self):
  model={'id':'m','version':'1'}; prompt='frozen'; first={'id':'one','content_hash':'a'}; second={'id':'two','content_hash':'b'}
  self.assertNotEqual(matrix.request_hash(first,model,prompt),matrix.request_hash(second,model,prompt))

if __name__=='__main__': unittest.main()
