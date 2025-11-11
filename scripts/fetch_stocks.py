#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
한투 종목 마스터 파일에서 ST(주권)만 추출하여 JSON 출력
"""
import urllib.request
import ssl
import zipfile
import os
import json
import tempfile

def download_and_parse(market):
    """KOSPI 또는 KOSDAQ 종목 다운로드 및 파싱"""
    url = f"https://new.real.download.dws.co.kr/common/master/{market.lower()}_code.mst.zip"
    
    # SSL 인증서 검증 비활성화
    ssl._create_default_https_context = ssl._create_unverified_context
    
    # 임시 디렉토리 생성
    with tempfile.TemporaryDirectory() as temp_dir:
        zip_path = os.path.join(temp_dir, f"{market.lower()}_code.zip")
        mst_path = os.path.join(temp_dir, f"{market.lower()}_code.mst")
        
        # ZIP 다운로드
        urllib.request.urlretrieve(url, zip_path)
        
        # ZIP 압축 해제
        with zipfile.ZipFile(zip_path) as z:
            z.extractall(temp_dir)
        
        # 뒤에서 몇 바이트인지 (KOSPI: 228, KOSDAQ: 222)
        back_length = 228 if market == 'KOSPI' else 222
        
        stocks = []
        
        # MST 파일 읽기
        with open(mst_path, mode="r", encoding="cp949") as f:
            for row in f:
                if len(row) < back_length + 21:
                    continue
                
                # 앞부분과 뒷부분 분리
                rf1 = row[0:len(row) - back_length]
                rf2 = row[-back_length:]
                
                # 앞부분 파싱
                code = rf1[0:9].strip()
                name = rf1[21:].strip()
                
                # 뒷부분 파싱 (그룹코드 2자리)
                group_code = rf2[0:2]
                
                # 6자리 숫자 코드 + ST(주권)만
                if len(code) == 6 and code.isdigit() and name and group_code == 'ST':
                    stocks.append({
                        'code': code,
                        'name': name,
                        'market': market
                    })
        
        return stocks

def main():
    """메인 함수"""
    try:
        kospi_stocks = download_and_parse('KOSPI')
        kosdaq_stocks = download_and_parse('KOSDAQ')
        
        all_stocks = kospi_stocks + kosdaq_stocks
        
        # JSON 출력
        print(json.dumps(all_stocks, ensure_ascii=False))
        
    except Exception as e:
        print(json.dumps({'error': str(e)}), file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    import sys
    main()
