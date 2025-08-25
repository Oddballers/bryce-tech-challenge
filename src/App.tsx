import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Upload, FileText, Github, ExternalLink, CheckCircle, AlertCircle, Loader2, Moon, Sun, Volume2, VolumeX } from 'lucide-react';
import Login from './components/Login';
import { auth } from './firebase';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import { useTheme } from './theme/ThemeContext';

interface UploadedFile {
  file: File;
  preview: string;
}

interface ChallengeResult {
  challengeLink: string;
  githubRepo: string;
  devUrl: string;
  message?: string;
}

function App() {
  const { isDarkMode, toggleDarkMode } = useTheme();
  const [copiedGit, setCopiedGit] = useState(false);
  const [copiedRepo, setCopiedRepo] = useState(false);
  const [copiedVSCode, setCopiedVSCode] = useState(false);
  const [resumeFile, setResumeFile] = useState<UploadedFile | null>(null);
  const [jobDescFile, setJobDescFile] = useState<UploadedFile | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<ChallengeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  // New fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [jobDescText, setJobDescText] = useState('');
  const [difficulty, setDifficulty] = useState('');
  // Simple audio: autoplay muted on load
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isMuted, setIsMuted] = useState(true);

  useEffect(() => {
    const audio = new Audio('/audio/allYourBase.m4a');
    audio.loop = true;
    audio.muted = true; // start muted to satisfy autoplay policies
    audio.volume = 0.7;
    audioRef.current = audio;
    audio.play().catch(() => {/* ignore autoplay errors */});
    return () => {
      try { audio.pause(); } catch {}
      // release
      audioRef.current = null;
    };
  }, []);

  // Auth state listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u: User | null) => setUser(u));
    return () => unsub();
  }, []);

  useEffect(() => {
    console.log("first name: ", firstName);
    console.log("last name: ", lastName);
    console.log("job description: ", jobDescText);
    console.log("difficulty: ", difficulty);
  }, [firstName, lastName, jobDescText, difficulty]);

  const handleSignOut = useCallback(async () => {
    await signOut(auth);
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      const a = audioRef.current;
      if (a) {
        a.muted = next;
        if (!next) {
          // ensure playback resumes on unmute within user gesture
          a.play().catch(() => {});
        }
      }
      return next;
    });
  }, []);

  // Dark mode is managed globally via ThemeContext

  // (YouTube player removed)

  const handleFileUpload = useCallback((file: File, type: 'resume' | 'jobdesc') => {
    const sizeInKB = file.size / 1024;
    const sizeInMB = file.size / 1024 / 1024;
    const sizeDisplay = sizeInMB >= 1
      ? `${sizeInMB.toFixed(2)} MB`
      : `${sizeInKB.toFixed(2)} KB`;
    const preview = `${file.name} (${sizeDisplay})`;
    const uploadedFile = { file, preview };
    
    if (type === 'resume') {
      setResumeFile(uploadedFile);
    } else {
      setJobDescFile(uploadedFile);
    }
    
    // Clear any previous errors
    setError(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, type: 'resume' | 'jobdesc') => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0], type);
    }
  }, [handleFileUpload]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>, type: 'resume' | 'jobdesc') => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0], type);
    }
  }, [handleFileUpload]);

  const removeFile = useCallback((type: 'resume' | 'jobdesc') => {
    if (type === 'resume') {
      setResumeFile(null);
    } else {
      setJobDescFile(null);
    }
  }, []);

  const submitFiles = async () => {
    if (!firstName.trim() || !lastName.trim() || !jobDescText.trim() || !difficulty || !resumeFile || !jobDescFile) {
      setError('Please complete all fields and upload both files before generating the challenge.');
      return;
    }

    setIsUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('resume', resumeFile.file);
      formData.append('job_description', jobDescFile.file);
      formData.append('first_name', firstName);
      formData.append('last_name', lastName);
      formData.append('job_desc_text', jobDescText);
      formData.append('difficulty', difficulty);

      // Use environment variable for function URL, fallback to placeholder
      const functionUrl = import.meta.env.VITE_FUNCTION_URL || 'https://us-central1-all-your-base-3a55f.cloudfunctions.net/generateCodingChallenge';
      const response = await fetch(functionUrl, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      // Add last name and job description to the repo link for uniqueness
      if (data && data.githubRepo && lastName && jobDescText) {
        // Hyphenate job description, remove extra spaces, lowercase
        const jobDescSlug = jobDescText.trim().toLowerCase().replace(/\s+/g, '-');
        const lastNameSlug = lastName.trim().toLowerCase();
        // Insert at the end of the repo name (before .git if present)
        let repoUrl = data.githubRepo;
        const match = repoUrl.match(/^(https:\/\/github.com\/[^\/]+\/)([^\/]+)(\.git)?$/);
        if (match) {
          const base = match[1];
          const repo = match[2];
          const dotGit = match[3] || '';
          const newRepo = `${repo}-${lastNameSlug}-${jobDescSlug}`;
          repoUrl = `${base}${newRepo}${dotGit}`;
        }
        setResult({ ...data, githubRepo: repoUrl });
      } else {
        setResult(data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred while generating the challenge.');
    } finally {
      setIsUploading(false);
    }
  };

  const resetForm = () => {
    setResumeFile(null);
    setJobDescFile(null);
    setResult(null);
    setError(null);
    setFirstName('');
    setLastName('');
    setJobDescText('');
    setDifficulty('');
  };

  // When signed out show Login
  if (!user) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${
        isDarkMode 
          ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900' 
          : 'bg-gradient-to-br from-blue-50 via-white to-indigo-50'
      }`}>
        {/* Dark Mode Toggle */}
        <button
          onClick={toggleDarkMode}
          className={`fixed top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg z-10 ${
            isDarkMode 
              ? 'bg-gray-700 hover:bg-gray-600 text-yellow-400' 
              : 'bg-white hover:bg-gray-50 text-gray-700'
          }`}
        >
          {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
        <Login />
      </div>
    );
  }

  if (result) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-4 ${
        isDarkMode 
          ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900' 
          : 'bg-gradient-to-br from-blue-50 via-white to-indigo-50'
      }`}>
        {/* Dark Mode Toggle */}
        <button
          onClick={toggleDarkMode}
          className={`fixed top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg z-10 ${
            isDarkMode 
              ? 'bg-gray-700 hover:bg-gray-600 text-yellow-400' 
              : 'bg-white hover:bg-gray-50 text-gray-700'
          }`}
        >
          {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
        
        <div className={`rounded-2xl shadow-2xl p-8 max-w-2xl w-full border ${
          isDarkMode 
            ? 'bg-gray-800 border-gray-700' 
            : 'bg-white border-gray-100'
        }`}>
          <div className="text-center mb-8">
            <div className={`mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4 ${
              isDarkMode ? 'bg-green-900' : 'bg-green-100'
            }`}>
              <CheckCircle className={`w-8 h-8 ${isDarkMode ? 'text-green-400' : 'text-green-600'}`} />
            </div>
            <h1 className={`text-3xl font-bold mb-2 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>Challenge Generated!</h1>
            <p className={`${isDarkMode ? 'text-gray-200' : 'text-gray-600'}`}>Your personalized coding challenge is ready</p>
          </div>

          <div className="space-y-6">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-blue-900 flex items-center">
                  <ExternalLink className="w-5 h-5 text-blue-600 mr-2" />
                  Coding Challenge
                </h3>
                <button
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center space-x-2 ${
                    copiedRepo 
                      ? 'bg-green-100 text-green-700 border border-green-200' 
                      : 'bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-200 hover:border-blue-300'
                  }`}
                  onClick={() => {
                    navigator.clipboard.writeText(result.challengeLink);
                    setCopiedRepo(true);
                    setTimeout(() => setCopiedRepo(false), 2000);
                  }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>{copiedRepo ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
              <a 
                href={result.challengeLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline break-all transition-colors text-sm"
              >
                {result.challengeLink}
              </a>
            </div>

            <div className="bg-gradient-to-r from-gray-50 to-slate-50 rounded-xl p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900 flex items-center">
                  <Github className="w-5 h-5 text-gray-700 mr-2" />
                  GitHub Repository
                </h3>
                <button
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center space-x-2 ${
                    copiedVSCode 
                      ? 'bg-green-100 text-green-700 border border-green-200' 
                      : 'bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-200 hover:border-blue-300'
                  }`}
                  onClick={() => {
                    navigator.clipboard.writeText(result.githubRepo);
                    setCopiedVSCode(true);
                    setTimeout(() => setCopiedVSCode(false), 2000);
                  }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span>{copiedVSCode ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
              <a 
                href={result.githubRepo}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-700 hover:text-gray-900 underline break-all transition-colors text-sm"
              >
                {result.githubRepo}
              </a>
            </div>

            {result.message && (
              <div className="bg-yellow-50 rounded-xl p-4 border border-yellow-200">
                <p className="text-yellow-800">{result.message}</p>
              </div>
            )}

            {/* Git Clone Section */}
            {result.githubRepo && (
              <div className="bg-gradient-to-r from-gray-50 to-slate-50 rounded-xl p-6 border border-gray-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900 flex items-center">
                    <Github className="w-5 h-5 text-gray-700 mr-2" />
                    Git Clone
                  </h3>
                  <button
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 flex items-center space-x-2 ${
                      copiedGit 
                        ? 'bg-green-100 text-green-700 border border-green-200' 
                        : 'bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-200 hover:border-blue-300'
                    }`}
                    onClick={() => {
                      navigator.clipboard.writeText(`git clone ${result.githubRepo}`);
                      setCopiedGit(true);
                      setTimeout(() => setCopiedGit(false), 2000);
                    }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>{copiedGit ? 'Copied!' : 'Copy'}</span>
                  </button>
                </div>
                <div className="bg-gray-900 rounded-lg p-4 font-mono text-sm text-gray-100">
                  git clone {result.githubRepo}
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 text-center">
            <button
              onClick={resetForm}
              className="text-white px-8 py-3 rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-xl"
              style={{ backgroundColor: '#00A287' }}
              onMouseEnter={(e) => (e.target as HTMLButtonElement).style.backgroundColor = '#00917A'}
              onMouseLeave={(e) => (e.target as HTMLButtonElement).style.backgroundColor = '#00A287'}
            >
              Generate Another Challenge
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen flex items-center justify-center p-4 ${
      isDarkMode 
        ? 'bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900' 
        : 'bg-gradient-to-br from-blue-50 via-white to-indigo-50'
    }`}>
      {/* Controls: Mute + Dark Mode */}
      <button
        onClick={toggleMute}
        aria-label={isMuted ? 'Unmute audio' : 'Mute audio'}
        className={`fixed top-4 right-16 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg z-10 ${
          isDarkMode 
            ? 'bg-gray-700 hover:bg-gray-600 text-gray-100' 
            : 'bg-white hover:bg-gray-50 text-gray-700'
        }`}
        title={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
      </button>

      {/* Dark Mode Toggle */}
      <button
        onClick={toggleDarkMode}
        className={`fixed top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg z-10 ${
          isDarkMode 
            ? 'bg-gray-700 hover:bg-gray-600 text-yellow-400' 
            : 'bg-white hover:bg-gray-50 text-gray-700'
        }`}
      >
        {isDarkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>
      
      <div className={`rounded-2xl shadow-2xl p-8 max-w-4xl w-full border ${
        isDarkMode 
          ? 'bg-gray-800 border-gray-700' 
          : 'bg-white border-gray-100'
      }`}>
        <div className="text-center mb-8 relative">
          <div className="mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-4">
            <img src="/aries-logo.svg" alt="ARIES Logo" className="w-20 h-20" />
          </div>
          <h1 className={`text-3xl font-bold mb-2 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>ARIES</h1>
          <p className={`text-lg font-medium mb-4 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Automated Routines for Intelligent Engineering Scenarios</p>
          <p className={`max-w-2xl mx-auto ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
            Upload your resume and a job description to generate a personalized coding challenge. 
            We'll create a GitHub repository with tailored tasks based on the role requirements.
          </p>
          <button
            onClick={handleSignOut}
            className={`absolute right-0 top-0 text-sm px-3 py-1 rounded-md border ${isDarkMode ? 'text-gray-200 border-gray-600 hover:bg-gray-700' : 'text-gray-700 border-gray-200 hover:bg-gray-50'}`}
          >
            Sign out
          </button>
        </div>

        {/* New: User Info and Job Description/Difficulty */}
        <div className="mb-8 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-semibold mb-1 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>First Name</label>
              <input
                type="text"
                value={firstName}
                onChange={e => setFirstName(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-base focus:outline-none focus:ring-2 transition-all ${isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100 focus:ring-blue-500' : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-400'}`}
                placeholder="Enter your first name"
                autoComplete="given-name"
              />
            </div>
            <div>
              <label className={`block text-sm font-semibold mb-1 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Last Name</label>
              <input
                type="text"
                value={lastName}
                onChange={e => setLastName(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-base focus:outline-none focus:ring-2 transition-all ${isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100 focus:ring-blue-500' : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-400'}`}
                placeholder="Enter your last name"
                autoComplete="family-name"
              />
            </div>
          </div>
          {/* Job Title and Difficulty on same line */}
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-semibold mb-1 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Job Title</label>
              <input
                type="text"
                value={jobDescText}
                onChange={e => setJobDescText(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-base focus:outline-none focus:ring-2 transition-all ${isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100 focus:ring-blue-500' : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-400'}`}
                placeholder="e.g. Frontend Developer, Data Scientist, etc."
                autoComplete="off"
              />
            </div>
            <div>
              <label className={`block text-sm font-semibold mb-1 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Difficulty</label>
              <select
                value={difficulty}
                onChange={e => setDifficulty(e.target.value)}
                className={`w-full rounded-lg border px-3 py-2 text-base focus:outline-none focus:ring-2 transition-all ${isDarkMode ? 'bg-gray-700 border-gray-600 text-gray-100 focus:ring-blue-500' : 'bg-white border-gray-300 text-gray-900 focus:ring-blue-400'}`}
              >
                <option value="" disabled>Selected difficulty</option>
                <option value="junior">Junior</option>
                <option value="intermediate">Intermediate</option>
                <option value="senior">Senior</option>
              </select>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Resume Upload */}
          <div className="space-y-4">
            <label className={`block text-sm font-semibold mb-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}> 
              1. Upload Your Resume
            </label>
            <div
              onDrop={(e) => handleDrop(e, 'resume')}
              onDragOver={handleDragOver}
              className={`relative border-2 border-dashed rounded-xl p-4 text-center transition-all duration-200 cursor-pointer group ${
                isDarkMode
                  ? 'border-gray-600 hover:border-blue-400 hover:bg-blue-900/20'
                  : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
              }`}
              style={{ minHeight: '120px', maxWidth: '260px', margin: '0 auto' }}
            >
              {resumeFile ? (
                <div className="space-y-2">
                  <FileText className="w-4 h-4 text-green-600 mx-auto" style={{ width: '18%', height: '18%' }} />
                  <p className={`text-xs font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{resumeFile.preview}</p>
                  <button
                    onClick={() => removeFile('resume')}
                    className={`text-xs font-medium transition-colors ${isDarkMode ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-800'}`}
                  >
                    Remove file
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className={`w-4 h-4 mx-auto transition-colors ${
                    isDarkMode 
                      ? 'text-gray-400 group-hover:text-blue-400' 
                      : 'text-gray-400 group-hover:text-blue-600'
                  }`} style={{ width: '18%', height: '18%' }} />
                  <div>
                    <p className={`font-medium text-xs ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Drop your resume here</p>
                    <p className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>or click to browse</p>
                  </div>
                  <p className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`}>PDF, DOC, DOCX, TXT (max 10MB)</p>
                </div>
              )}
              <input
                type="file"
                onChange={(e) => handleFileInputChange(e, 'resume')}
                accept=".pdf,.doc,.docx,.txt"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
          </div>

          {/* Job Description Upload */}
          <div className="space-y-4">
            <label className={`block text-sm font-semibold mb-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}> 
              2. Upload Job Description
            </label>
            <div
              onDrop={(e) => handleDrop(e, 'jobdesc')}
              onDragOver={handleDragOver}
              className={`relative border-2 border-dashed rounded-xl p-4 text-center transition-all duration-200 cursor-pointer group ${
                isDarkMode
                  ? 'border-gray-600 hover:border-blue-400 hover:bg-blue-900/20'
                  : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
              }`}
              style={{ minHeight: '120px', maxWidth: '260px', margin: '0 auto' }}
            >
              {jobDescFile ? (
                <div className="space-y-2">
                  <FileText className="w-4 h-4 text-green-600 mx-auto" style={{ width: '18%', height: '18%' }} />
                  <p className={`text-xs font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>{jobDescFile.preview}</p>
                  <button
                    onClick={() => removeFile('jobdesc')}
                    className={`text-xs font-medium transition-colors ${isDarkMode ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-800'}`}
                  >
                    Remove file
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className={`w-4 h-4 mx-auto transition-colors ${
                    isDarkMode 
                      ? 'text-gray-400 group-hover:text-blue-400' 
                      : 'text-gray-400 group-hover:text-blue-600'
                  }`} style={{ width: '18%', height: '18%' }} />
                  <div>
                    <p className={`font-medium text-xs ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>Drop job description here</p>
                    <p className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-500'}`}>or click to browse</p>
                  </div>
                  <p className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-400'}`}>PDF, DOC, DOCX, TXT (max 10MB)</p>
                </div>
              )}
              <input
                type="file"
                onChange={(e) => handleFileInputChange(e, 'jobdesc')}
                accept=".pdf,.doc,.docx,.txt"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl flex items-center">
            <AlertCircle className="w-5 h-5 text-red-600 mr-3" />
            <p className="text-red-800">{error}</p>
          </div>
        )}

        <div className="text-center">
          <button
            onClick={submitFiles}
            disabled={
              !firstName.trim() ||
              !lastName.trim() ||
              !jobDescText.trim() ||
              !difficulty ||
              !resumeFile ||
              !jobDescFile ||
              isUploading
            }
            className="text-white px-8 py-4 rounded-xl font-semibold disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl disabled:shadow-none flex items-center justify-center mx-auto min-w-[200px]"
            style={{ 
              backgroundColor: (!firstName.trim() || !lastName.trim() || !jobDescText.trim() || !difficulty || !resumeFile || !jobDescFile || isUploading) ? '#9CA3AF' : '#00A287'
            }}
            onMouseEnter={(e) => {
              if (firstName.trim() && lastName.trim() && jobDescText.trim() && difficulty && resumeFile && jobDescFile && !isUploading) {
                (e.target as HTMLButtonElement).style.backgroundColor = '#00A287';
              }
            }}
            onMouseLeave={(e) => {
              if (firstName.trim() && lastName.trim() && jobDescText.trim() && difficulty && resumeFile && jobDescFile && !isUploading) {
                (e.target as HTMLButtonElement).style.backgroundColor = '#00A287';
              }
            }}
          >
            {isUploading ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Generating Challenge...
              </>
            ) : (
              <>
                <Github className="w-5 h-5 mr-2" />
                Generate Challenge
              </>
            )}
          </button>
          
          <p className={`text-xs mt-4 max-w-lg mx-auto ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            3. Click "Generate Challenge" to create your personalized coding challenge and GitHub repository
          </p>
        </div>

        <div className={`mt-8 pt-6 border-t ${isDarkMode ? 'border-gray-700' : 'border-gray-100'}`}>
          <div className="grid md:grid-cols-3 gap-4 text-center">
            <div className="space-y-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto ${
                isDarkMode ? 'bg-blue-900' : 'bg-blue-100'
              }`}>
                <span className={`font-bold text-sm ${isDarkMode ? 'text-blue-300' : 'text-blue-600'}`}>1</span>
              </div>
              <h3 className={`font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>Upload Files</h3>
              <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Resume and job description</p>
            </div>
            <div className="space-y-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto ${
                isDarkMode ? 'bg-blue-900' : 'bg-blue-100'
              }`}>
                <span className={`font-bold text-sm ${isDarkMode ? 'text-blue-300' : 'text-blue-600'}`}>2</span>
              </div>
              <h3 className={`font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>AI Analysis</h3>
              <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Match skills to requirements</p>
            </div>
            <div className="space-y-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center mx-auto ${
                isDarkMode ? 'bg-blue-900' : 'bg-blue-100'
              }`}>
                <span className={`font-bold text-sm ${isDarkMode ? 'text-blue-300' : 'text-blue-600'}`}>3</span>
              </div>
              <h3 className={`font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-900'}`}>Get Challenge</h3>
              <p className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Personalized coding tasks</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;