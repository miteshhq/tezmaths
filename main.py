import os

def should_skip_directory(dir_name):
    """Check if directory should be skipped"""
    skip_dirs = {
        '.expo', 'node_modules', '.git', '__pycache__', 
        '.vscode', '.idea', 'dist', 'build', '.next',
        'coverage', '.nyc_output', 'logs', 'temp', 'tmp'
    }
    return dir_name in skip_dirs or dir_name.startswith('.')

def find_and_extract_files(target_files, root_dir='.', output_file='raw.txt'):
    """
    Search for specified files and extract their content to raw.txt
    
    Args:
        target_files: List of file names to search for
        root_dir: Root directory to start search from
        output_file: Output file to write results
    """
    
    with open(output_file, 'w', encoding='utf-8') as out_file:
        for root, dirs, files in os.walk(root_dir):
            # Remove directories to skip from dirs list (modifies os.walk behavior)
            dirs[:] = [d for d in dirs if not should_skip_directory(d)]
            
            for file in files:
                if file in target_files:
                    file_path = os.path.join(root, file)
                    try:
                        # Write file path
                        out_file.write(f"{'='*60}\n")
                        out_file.write(f"FILE: {file_path}\n")
                        out_file.write(f"{'='*60}\n\n")
                        
                        # Read and write file content
                        with open(file_path, 'r', encoding='utf-8') as f:
                            content = f.read()
                            out_file.write(content)
                            out_file.write('\n\n')
                        
                        print(f"Processed: {file_path}")
                        
                    except Exception as e:
                        out_file.write(f"ERROR reading file: {str(e)}\n\n")
                        print(f"Error processing {file_path}: {str(e)}")

# Usage example
if __name__ == "__main__":
    # Define the files you want to search for
    files_to_find = [
        # 'battle-room.tsx',
        'battle-screen.tsx',
        # 'multiplayer-mode-selection.tsx',
        'battleManager.js',
        'battle-results.tsx',        
        # 'battlelistner.ts',
        # 'LeaveConfirmationModal.tsx'             
    ]
    
    # Start the search from current directory
    find_and_extract_files(files_to_find)
    print("File extraction completed. Check raw.txt for results.")