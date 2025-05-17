#!/usr/bin/env python3
import os
import argparse
import sys

def is_text_file(filepath, blocksize=512):
    """
    Quick check to see if a file is likely text.
    Reads a small block and fails if it finds a null byte.
    """
    try:
        with open(filepath, 'rb') as f:
            block = f.read(blocksize)
        return b'\0' not in block
    except Exception:
        return False

def dump_files_with_contents(root_dir: str, exclude_dirs: set, exclude_files: set, output_path: str):
    """
    Walks through root_dir (skipping exclude_dirs and exclude_files), and writes each file's
    absolute path and contents to output_path.
    """
    with open(output_path, 'w', encoding='utf-8', errors='replace') as out_f:
        for dirpath, dirnames, filenames in os.walk(root_dir):
            # Prevent descending into excluded directories
            dirnames[:] = [d for d in dirnames if d not in exclude_dirs]

            for fname in filenames:
                # Skip excluded files
                if fname in exclude_files:
                    continue
                file_path = os.path.abspath(os.path.join(dirpath, fname))
                # Also skip the output file itself
                if os.path.abspath(output_path) == file_path:
                    continue

                out_f.write(f"=== FILE: {file_path} ===\n")
                # Only attempt to read text files
                if is_text_file(file_path):
                    try:
                        with open(file_path, 'r', encoding='utf-8', errors='replace') as in_f:
                            for line in in_f:
                                out_f.write(line)
                    except Exception as e:
                        out_f.write(f"[Error reading file: {e}]\n")
                else:
                    out_f.write("[Binary or non-text file — contents omitted]\n")
                out_f.write("\n")  # blank line between files

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
        help="Directory names to skip (default: node_modules, .git, build, dist, assets)"
    )
    parser.add_argument(
        "--exclude-files",
        nargs="*",
        default=["dump.txt", "package-lock.json", "main.py"],
        help="File names to skip (default: dump.txt, package-lock.json, main.py)"
    )
    args = parser.parse_args()

    output_file = os.path.join(args.root, "dump.txt")
    try:
        dump_files_with_contents(
            args.root,
            set(args.exclude_dirs),
            set(args.exclude_files),
            output_file
        )
        print(f"All file paths and contents written to {output_file}")
    except Exception as e:
        print(f"Error during dump: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
