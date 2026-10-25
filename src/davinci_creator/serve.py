"""Local preview server with byte ranges for Safari/WebKit video seeking."""
import os
import re
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler


def byte_range(header,size):
    match=re.fullmatch(r"bytes=(\d*)-(\d*)",header.strip())
    if not match or size<=0 or not any(match.groups()):
        raise ValueError("Unsupported range")
    first,last=match.groups()
    if not first:
        suffix=int(last)
        if suffix<=0:raise ValueError("Invalid suffix")
        return max(0,size-suffix),size-1
    start=int(first);end=min(size-1,int(last)) if last else size-1
    if start>=size or end<start:raise ValueError("Unsatisfiable range")
    return start,end


class RangeHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        self._range=None
        path=self.translate_path(self.path)
        if not self.headers.get("Range") or not os.path.isfile(path):
            return super().send_head()
        stream=open(path,"rb")
        stat=os.fstat(stream.fileno())
        try:
            first,last=byte_range(self.headers["Range"],stat.st_size)
        except ValueError:
            stream.close();self.send_response(HTTPStatus.REQUESTED_RANGE_NOT_SATISFIABLE)
            self.send_header("Content-Range",f"bytes */{stat.st_size}")
            self.send_header("Content-Length","0");self.end_headers();return None
        self._range=(first,last)
        self.send_response(HTTPStatus.PARTIAL_CONTENT)
        self.send_header("Content-Type",self.guess_type(path))
        self.send_header("Content-Length",str(last-first+1))
        self.send_header("Content-Range",f"bytes {first}-{last}/{stat.st_size}")
        self.send_header("Last-Modified",self.date_time_string(stat.st_mtime))
        self.end_headers();stream.seek(first)
        return stream

    def end_headers(self):
        self.send_header("Accept-Ranges","bytes")
        super().end_headers()

    def copyfile(self,source,output):
        try:
            self.copy_range(source,output)
        except (BrokenPipeError,ConnectionResetError):
            # Browsers cancel media ranges when the viewer seeks to another time.
            pass

    def copy_range(self,source,output):
        if self._range is None:
            return super().copyfile(source,output)
        remaining=self._range[1]-self._range[0]+1
        while remaining:
            data=source.read(min(64*1024,remaining))
            if not data:break
            output.write(data);remaining-=len(data)
