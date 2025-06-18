import json
from flask import Flask, render_template, request, jsonify
import os
from datetime import datetime

app = Flask(__name__, static_folder='static', template_folder='templates')

DATA_FILE = 'students.json'

# --- Helper functions to manage JSON data ---
def load_students_data():
    """
    Loads student data from the JSON file.
    Initializes the file if it doesn't exist or is empty/corrupted.
    Ensures essential fields exist for each student.
    """
    if not os.path.exists(DATA_FILE) or os.path.getsize(DATA_FILE) == 0:
        # Initialize with an empty list if file doesn't exist or is empty
        with open(DATA_FILE, 'w') as f:
            json.dump([], f)
        return []
    
    with open(DATA_FILE, 'r') as f:
        try:
            data = json.load(f)
            # Ensure data is a list; if not, re-initialize
            if not isinstance(data, list):
                print(f"Warning: {DATA_FILE} content is not a list. Initializing with empty list.")
                with open(DATA_FILE, 'w') as f_write:
                    json.dump([], f_write)
                return []

        except json.JSONDecodeError:
            print(f"Error: Could not decode JSON from {DATA_FILE}. Initializing with empty list.")
            with open(DATA_FILE, 'w') as f_write:
                json.dump([], f_write)
            return []
        
        # Ensure default values for existing students if they don't have them
        for student in data:
            if 'grade' not in student:
                student['grade'] = "Estudiante"
            if 'weeklyAmount' not in student:
                student['weeklyAmount'] = 2.00 # Default weekly amount if missing
            if 'startDate' not in student:
                student['startDate'] = datetime.now().isoformat().split('T')[0] # Default to today if missing
            if 'totalPaid' not in student:
                student['totalPaid'] = sum(p.get('amount', 0) for p in student.get('paymentHistory', []))
            if 'paymentHistory' not in student:
                student['paymentHistory'] = []
            if 'lastPaymentDate' not in student:
                # Find last payment date from history or set to None
                if student['paymentHistory']:
                    student['lastPaymentDate'] = max(p.get('date', '') for p in student['paymentHistory'] if p.get('date'))
                    # If max returns an empty string or None, set to None
                    if not student['lastPaymentDate']:
                        student['lastPaymentDate'] = None
                else:
                    student['lastPaymentDate'] = None
        return data


def save_students_data(data):
    """Saves student data to the JSON file."""
    with open(DATA_FILE, 'w') as f:
        json.dump(data, f, indent=4)

# --- Flask Routes ---

@app.route('/')
def index():
    """Renders the main index page."""
    return render_template('index.html')

@app.route('/api/students', methods=['GET'])
def get_students():
    """Returns the list of all students."""
    students = load_students_data()
    return jsonify(students)

@app.route('/api/students', methods=['POST'])
def add_student():
    """Adds a new student to the system."""
    students = load_students_data()
    new_student_data = request.json
    
    # Generate a new ID (find max ID and add 1, or start from 1 if no students)
    if students:
        new_id = max(s['id'] for s in students) + 1
    else:
        new_id = 1
        
    # Set default values for new student if not provided
    new_student_data['id'] = new_id
    new_student_data['grade'] = new_student_data.get('grade', "Estudiante")
    new_student_data['weeklyAmount'] = new_student_data.get('weeklyAmount', 2.00)
    new_student_data['startDate'] = new_student_data.get('startDate', datetime.now().isoformat().split('T')[0])
    new_student_data['totalPaid'] = new_student_data.get('totalPaid', 0.00)
    new_student_data['paymentHistory'] = new_student_data.get('paymentHistory', [])
    new_student_data['lastPaymentDate'] = new_student_data.get('lastPaymentDate', None)

    students.append(new_student_data)
    save_students_data(students)
    return jsonify(new_student_data), 201 # 201 Created

@app.route('/api/students/<int:student_id>', methods=['PUT'])
def register_payment(student_id):
    """Updates a student's information, primarily for registering payments."""
    students = load_students_data()
    updated_data = request.json
    
    for i, student in enumerate(students):
        if student['id'] == student_id:
            if 'payment' in updated_data:
                payment = updated_data['payment']
                # Ensure paymentHistory exists
                if 'paymentHistory' not in students[i]:
                    students[i]['paymentHistory'] = []
                students[i]['paymentHistory'].append(payment)
                
                # Ensure totalPaid exists before adding
                if 'totalPaid' not in students[i]:
                    students[i]['totalPaid'] = 0.0
                students[i]['totalPaid'] = round(students[i]['totalPaid'] + payment['amount'], 2)
                
                students[i]['lastPaymentDate'] = payment['date']
            
            # If other fields can be updated via PUT, add logic here:
            # for key, value in updated_data.items():
            #     if key not in ['payment']: # Exclude keys handled above
            #         students[i][key] = value

            save_students_data(students)
            return jsonify(students[i])
    return jsonify({'message': 'Student not found'}), 404

@app.route('/api/students/<int:student_id>', methods=['DELETE'])
def delete_student(student_id):
    """Deletes a student from the system."""
    students = load_students_data()
    initial_len = len(students)
    students = [s for s in students if s['id'] != student_id]
    if len(students) < initial_len:
        save_students_data(students)
        return jsonify({'message': 'Student deleted successfully'})
    return jsonify({'message': 'Student not found'}), 404

if __name__ == '__main__':
    # Ensure students.json exists and is valid on startup, and has default fields
    load_students_data() 
    app.run(debug=True) # debug=True allows for automatic reloading on code changes