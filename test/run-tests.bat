@echo off
REM STO Tools Keybind Manager Test Suite - Windows Batch Runner

setlocal enabledelayedexpansion

REM Check if Node.js is installed
node --version >nul 2>&1
if errorlevel 1 (
    echo Error: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

REM Change to test directory
cd /d "%~dp0"

REM Parse command line arguments
set "COMMAND=help"
set "VERBOSE="
set "FILTER="
set "REPORTER="
set "OUTPUT="

:parse_args
if "%~1"=="" goto :execute
if /i "%~1"=="help" set "COMMAND=help" & shift & goto :parse_args
if /i "%~1"=="install" set "COMMAND=install" & shift & goto :parse_args
if /i "%~1"=="test" set "COMMAND=test" & shift & goto :parse_args
if /i "%~1"=="test-verbose" set "COMMAND=test-verbose" & shift & goto :parse_args
if /i "%~1"=="test-unit" set "COMMAND=test-unit" & shift & goto :parse_args
if /i "%~1"=="test-integration" set "COMMAND=test-integration" & shift & goto :parse_args
if /i "%~1"=="test-ci" set "COMMAND=test-ci" & shift & goto :parse_args
if /i "%~1"=="test-json" set "COMMAND=test-json" & shift & goto :parse_args
if /i "%~1"=="test-junit" set "COMMAND=test-junit" & shift & goto :parse_args
if /i "%~1"=="test-tap" set "COMMAND=test-tap" & shift & goto :parse_args
if /i "%~1"=="clean" set "COMMAND=clean" & shift & goto :parse_args
if /i "%~1"=="browser" set "COMMAND=browser" & shift & goto :parse_args
if /i "%~1"=="--verbose" set "VERBOSE=--verbose" & shift & goto :parse_args
if /i "%~1"=="--filter" set "FILTER=--filter %~2" & shift & shift & goto :parse_args
if /i "%~1"=="--reporter" set "REPORTER=--reporter %~2" & shift & shift & goto :parse_args
if /i "%~1"=="--output" set "OUTPUT=--output %~2" & shift & shift & goto :parse_args
shift
goto :parse_args

:execute
if "%COMMAND%"=="help" goto :help
if "%COMMAND%"=="install" goto :install
if "%COMMAND%"=="test" goto :test
if "%COMMAND%"=="test-verbose" goto :test_verbose
if "%COMMAND%"=="test-unit" goto :test_unit
if "%COMMAND%"=="test-integration" goto :test_integration
if "%COMMAND%"=="test-ci" goto :test_ci
if "%COMMAND%"=="test-json" goto :test_json
if "%COMMAND%"=="test-junit" goto :test_junit
if "%COMMAND%"=="test-tap" goto :test_tap
if "%COMMAND%"=="clean" goto :clean
if "%COMMAND%"=="browser" goto :browser

:help
echo STO Tools Keybind Manager Test Suite
echo.
echo Usage: run-tests.bat [command] [options]
echo.
echo Commands:
echo   help              Show this help message
echo   install           Install dependencies
echo   test              Run all tests
echo   test-verbose      Run tests with verbose output
echo   test-unit         Run only unit tests
echo   test-integration  Run only integration tests
echo   test-ci           Run tests for CI (with JUnit output)
echo   test-json         Generate JSON test report
echo   test-junit        Generate JUnit XML report
echo   test-tap          Generate TAP report
echo   clean             Clean generated files
echo   browser           Open browser test runner
echo.
echo Options:
echo   --verbose         Show detailed output
echo   --filter ^<pattern^>  Run only tests matching pattern
echo   --reporter ^<type^>   Reporter type: default, json, junit, tap
echo   --output ^<file^>     Output file for test results
echo.
echo Examples:
echo   run-tests.bat test
echo   run-tests.bat test-verbose
echo   run-tests.bat test --filter "Data"
echo   run-tests.bat test-junit --output results.xml
goto :end

:install
echo Installing test dependencies...
if not exist package.json (
    echo Error: package.json not found
    goto :error
)
npm install
if errorlevel 1 (
    echo Error: Failed to install dependencies
    goto :error
)
echo Dependencies installed successfully!
goto :end

:test
echo Running all tests...
node cli-runner.js %VERBOSE% %FILTER% %REPORTER% %OUTPUT%
goto :check_result

:test_verbose
echo Running tests with verbose output...
node cli-runner.js --verbose %FILTER% %REPORTER% %OUTPUT%
goto :check_result

:test_unit
echo Running unit tests...
node cli-runner.js --filter "Module" --verbose %REPORTER% %OUTPUT%
goto :check_result

:test_integration
echo Running integration tests...
node cli-runner.js --filter "Integration" --verbose %REPORTER% %OUTPUT%
goto :check_result

:test_ci
echo Running tests for CI...
node cli-runner.js --reporter junit --output test-results.xml --stop-on-failure
goto :check_result

:test_json
echo Generating JSON test report...
node cli-runner.js --reporter json --output results.json
if errorlevel 1 goto :error
echo Report saved to results.json
goto :end

:test_junit
echo Generating JUnit XML report...
node cli-runner.js --reporter junit --output results.xml
if errorlevel 1 goto :error
echo Report saved to results.xml
goto :end

:test_tap
echo Generating TAP report...
node cli-runner.js --reporter tap --output results.tap
if errorlevel 1 goto :error
echo Report saved to results.tap
goto :end

:clean
echo Cleaning generated files...
if exist results.json del results.json
if exist results.xml del results.xml
if exist results.tap del results.tap
if exist test-results.xml del test-results.xml
if exist node_modules rmdir /s /q node_modules
echo Clean complete!
goto :end

:browser
echo Opening browser test runner...
REM Try to start a local server
python --version >nul 2>&1
if not errorlevel 1 (
    echo Starting local server on http://localhost:8080
    echo Press Ctrl+C to stop the server
    cd ..
    python -m http.server 8080
    goto :end
)

python3 --version >nul 2>&1
if not errorlevel 1 (
    echo Starting local server on http://localhost:8080
    echo Press Ctrl+C to stop the server
    cd ..
    python3 -m http.server 8080
    goto :end
)

REM If Python is not available, try to open the file directly
echo Python not found. Opening test runner in default browser...
start "" "index.html"
goto :end

:check_result
if errorlevel 1 (
    echo.
    echo Tests failed!
    goto :error
) else (
    echo.
    echo All tests passed!
    goto :end
)

:error
echo.
echo An error occurred. Exit code: %errorlevel%
pause
exit /b 1

:end
echo.
pause
exit /b 0 