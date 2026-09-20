"""
Jev Brain — Python AI Agent Integration Example
Demonstrates how Python AI agents (LangChain, CrewAI, AutoGen, LlamaIndex)
can use Jev Brain's pre-execution firewall (<1ms) to verify tool calls before execution.
"""

import requests
import json
import time

JEV_URL = "http://localhost:3333/api/warden"

def pre_flight_safety_gate(tool_name: str, command: str, filepath: str = "") -> dict:
    """
    Evaluate 4 critical pre-flight questions before tool execution:
    1. Is this the right file?
    2. Is this irreversible?
    3. Are we looping?
    4. Are we done?
    """
    payload = {
        "tool": tool_name,
        "command": command,
        "filepath": filepath
    }
    
    start = time.perf_counter()
    try:
        res = requests.post(JEV_URL, json=payload, timeout=1.0)
        res.raise_for_status()
        data = res.json()
        latency_ms = (time.perf_counter() - start) * 1000
        data["latency_ms"] = round(latency_ms, 2)
        return data
    except Exception as e:
        return {"decision": "NEEDS_CONFIRM", "error": str(e)}

if __name__ == "__main__":
    print("⚡ Testing Jev Agent Warden from Python...\n")
    
    # 1. Test a safe command
    safe_result = pre_flight_safety_gate("bash", "git status", "src/main.py")
    print(f"Safe Command [git status]: {safe_result.get('decision')} ({safe_result.get('latency_ms', 0)}ms)")
    
    # 2. Test a destructive command
    risky_result = pre_flight_safety_gate("bash", "rm -rf /var/data", ".env")
    print(f"Risky Command [rm -rf /var/data]: {risky_result.get('decision')} ({risky_result.get('latency_ms', 0)}ms)")
    print(f"Reason: {risky_result.get('reasons')}")
