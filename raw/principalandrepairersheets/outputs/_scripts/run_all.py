"""Run the whole principalandrepairersheets analysis end-to-end.

    python outputs/_scripts/run_all.py

Reproducible: TODAY is pinned (2026-06-18), no network, no randomness. Re-running
overwrites the outputs in place. Files currently open in Excel are written to a
`.new.csv` sibling instead of being clobbered (reported at the end).
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _lib as L
import task1, task2, task3, task4, task5, task6, task7

for mod in (task1, task2, task3, task4, task5, task6, task7):
    mod.run()

print("\n=== run_all complete ===")
if L.LOCKED_WRITES:
    print("These canonical files were open elsewhere (Excel) and were written as "
          "'<name>.new.csv' instead — close them and re-run to finalise:")
    for p in sorted(set(L.LOCKED_WRITES)):
        print("   ", p.split("outputs")[-1])
else:
    print("All outputs written to their canonical filenames.")
