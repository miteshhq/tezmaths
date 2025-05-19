#!/usr/bin/env python3
import os
import argparse
import sys

# === CONFIGURATION ===
DUMP_ALL_FILES = True  # Set to False to dump only specific files
WITH_CONTENTS = False
FILES_TO_DUMP = [
    # Filenames to search and dump
    "home.tsx",
    "QuizScreen.tsx",
]
# =====================

def is_text_file(filepath, blocksize=512):
    try:
        with open(filepath, 'rb') as f:
            block = f.read(blocksize)
        return b'\0' not in block
    except Exception:
        return False


def dump_files_with_contents(root_dir: str, exclude_dirs: set, exclude_files: set, output_path: str):
    with open(output_path, 'w', encoding='utf-8', errors='replace') as out_f:
        for dirpath, dirnames, filenames in os.walk(root_dir):
            # Exclude specified directories
            dirnames[:] = [d for d in dirnames if d not in exclude_dirs]
            for fname in filenames:
                if fname in exclude_files:
                    continue
                file_path = os.path.abspath(os.path.join(dirpath, fname))
                if os.path.abspath(output_path) == file_path:
                    continue
                out_f.write(f"=== FILE: {file_path} ===\n")
                if WITH_CONTENTS:
                    if is_text_file(file_path):
                        try:
                            with open(file_path, 'r', encoding='utf-8', errors='replace') as in_f:
                                out_f.write(in_f.read())
                        except Exception as e:
                            out_f.write(f"[Error reading file: {e}]\n")
                    else:
                        out_f.write("[Binary or non-text file — contents omitted]\n")
                    out_f.write("\n")


def dump_selected_files(root_dir: str, files_to_dump: list, exclude_dirs: set, output_path: str):
    with open(output_path, 'w', encoding='utf-8', errors='replace') as out_f:
        for target_name in files_to_dump:
            # Search for all occurrences of target_name under root_dir
            matches = []
            for dirpath, dirnames, filenames in os.walk(root_dir):
                dirnames[:] = [d for d in dirnames if d not in exclude_dirs]
                if target_name in filenames:
                    matches.append(os.path.join(dirpath, target_name))
            if not matches:
                out_f.write(f"=== FILE: {target_name} ===\n[Not found anywhere]\n\n")
                continue
            for file_path in matches:
                out_f.write(f"=== FILE: {file_path} ===\n")
                if WITH_CONTENTS:
                    if is_text_file(file_path):
                        try:
                            with open(file_path, 'r', encoding='utf-8', errors='replace') as in_f:
                                out_f.write(in_f.read())
                        except Exception as e:
                            out_f.write(f"[Error reading file: {e}]\n")
                    else:
                        out_f.write("[Binary or non-text file — contents omitted]\n")
                    out_f.write("\n")


def main():
    parser = argparse.ArgumentParser(
        description="Dump all files and their contents in a project to dump.txt, skipping specified folders and files."
    )
    parser.add_argument(
        "root",
        nargs="?",
        default=".",
        help="Project root directory (default: current directory)"
    )
    parser.add_argument(
        "--exclude-dirs",
        nargs="*",
        default=["node_modules", ".git", "build", "dist", "assets", ".expo"],
        help="Directory names to skip (default: node_modules, .git, build, dist, assets, .expo)"
    )
    parser.add_argument(
        "--exclude-files",
        nargs="*",
        default=["dump.txt", "package-lock.json", "main.py"],
        help="File names to skip (default: dump.txt, package-lock.json, main.py)"
    )
    args = parser.parse_args()

    output_file =  os.path.join(args.root, "dump.txt") if WITH_CONTENTS else  os.path.join(args.root, "dump_paths.txt")
    
    try:
        if DUMP_ALL_FILES:
            dump_files_with_contents(
                args.root,
                set(args.exclude_dirs),
                set(args.exclude_files),
                output_file
            )
        else:
            dump_selected_files(
                args.root,
                FILES_TO_DUMP,
                set(args.exclude_dirs),
                output_file
            )
        print(f"File dump written to {output_file}")
    except Exception as e:
        print(f"Error during dump: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()